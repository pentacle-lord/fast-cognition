import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

function TreeNode({ node, onSelect, parentTitle, onContextMenu }) {
  const [open, setOpen] = useState(true)
  const hasChildren = node.children && node.children.length > 0

  return (
    <div className="ml-4 border-l border-gray-200 pl-3">
      <div className="flex items-center gap-2 py-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            {open ? '−' : '+'}
          </button>
        ) : (
          <span className="w-5 h-5" />
        )}
        <button
          type="button"
          onClick={() => onSelect?.(node)}
          onContextMenu={(e) => {
            e.preventDefault()
            onContextMenu?.(e, node, parentTitle)
          }}
          className="text-sm font-medium text-gray-800 hover:text-blue-600 hover:underline text-left"
        >
          {node.title}
        </button>
        <span className="text-xs text-gray-400">L{node.level}</span>
      </div>
      {hasChildren && open && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} parentTitle={node.title} onSelect={onSelect} onContextMenu={onContextMenu} />
          ))}
        </div>
      )}
    </div>
  )
}


/*
  const [open, setOpen] = useState(true)
  const hasChildren = node.children && node.children.length > 0

  return (
    <div className="ml-4 border-l border-gray-200 pl-3">
      <div className="flex items-center gap-2 py-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            {open ? '−' : '+'}
          </button>
        ) : (
          <span className="w-5 h-5" />
        )}
        <button
          type="button"
          onClick={() => onSelect?.(node)}
          className="text-sm font-medium text-gray-800 hover:text-blue-600 hover:underline text-left"
        >
          {node.title}
        </button>
          {node.title}
        </span>
        <span className="text-xs text-gray-400">L{node.level}</span>
      </div>
      {hasChildren && open && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  )
}

*/
function App() {
  const [topic, setTopic] = useState('认知心理学')
  const [depth, setDepth] = useState(2)
  const [branch, setBranch] = useState(5)
  const [model, setModel] = useState('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [tempApiKey, setTempApiKey] = useState('')
  const [ollamaModels, setOllamaModels] = useState([])
  const [selectedOllamaModel, setSelectedOllamaModel] = useState('')
  const [saveLabel, setSaveLabel] = useState('设为默认')
  const [tree, setTree] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [content, setContent] = useState(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError] = useState(null)
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, node: null, parentTitle: null })
  const [nodeContents, setNodeContents] = useState({})
  const [customPrompt, setCustomPrompt] = useState(`请严格按照以下结构生成认知树：
【第一层分类要求】
必须且只能包含以下5个维度，请根据主题深入挖掘：

源（事物的本质与本源）

道（融合之道、底层规律）

始（创造、如何从零开始）

极（极致、最有价值与最难的挑战）

空（如何自然、无形地运用到生活中）

【第二层分类要求】
针对第一层的每一个维度，请你自由发散，展开为5个具体的子分类。
针对子分类的命名，请侧重探索：它的本源是什么？它融合了什么？能带来哪些新发现？其中最有价值的部分和最难突破的瓶颈分别是什么？

请结合用户输入的主题，严格按照上述框架返回标准 JSON 树状结构。`)
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [progressTotal, setProgressTotal] = useState(0)
  const [progressDone, setProgressDone] = useState(0)
  const [isGeneratingAll, setIsGeneratingAll] = useState(false)
  const [showPauseControls, setShowPauseControls] = useState(false)
  const [pauseLabel, setPauseLabel] = useState('⏸️ 暂停生成')
  const isPausedRef = useRef(false)
  const isStoppedRef = useRef(false)
  const [currentGenerating, setCurrentGenerating] = useState('')
  const [logs, setLogs] = useState([])
  const logRef = useRef(null)

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/ollama-models')
      .then((res) => res.json())
      .then((data) => {
        const models = data.models || []
        setOllamaModels(models)
        const saved = localStorage.getItem('default_ollama_model')
        if (saved && models.includes(saved)) {
          setSelectedOllamaModel(saved)
        } else if (models.includes('qwen3.5:9b')) {
          setSelectedOllamaModel('qwen3.5:9b')
        } else if (models.length > 0) {
          setSelectedOllamaModel(models[0])
        }
      })
      .catch(() => setOllamaModels([]))
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('llm_api_key')
    if (saved) setApiKey(saved)
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  const handleGenerate = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('http://127.0.0.1:8000/api/generate-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, depth: Number(depth), branch: Number(branch), classification_prompt: customPrompt, api_key: apiKey }),
      })
      if (!res.ok) throw new Error(`请求失败: ${res.status}`)
      const data = await res.json()
      setTree(data.tree)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleNodeSelect = async (node) => {
    if (node?.content) {
      setContent(node.content)
      return
    }
    setContentLoading(true)
    setContentError(null)
    try {
      const res = await fetch('http://127.0.0.1:8000/api/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: node.title, model_name: model, custom_ollama_model: model === 'ollama' ? selectedOllamaModel : '', api_key: apiKey }),
      })
      if (!res.ok) throw new Error(`请求失败: ${res.status}`)
      const data = await res.json()
      setContent(data.content)
      if (node) node.content = data.content
      if (node?.id) {
        setNodeContents((prev) => ({ ...prev, [node.id]: data.content }))
        setTree((prev) => updateTreeContent(prev, node.id, data.content))
      }
    } catch (err) {
      setContentError(err.message)
    } finally {
      setContentLoading(false)
    }
  }

  const handlePauseResume = () => {
    if (isPausedRef.current) {
      isPausedRef.current = false
      setPauseLabel('⏸️ 暂停生成')
      setLogs((prev) => [...prev, '继续生成'])
    } else {
      isPausedRef.current = true
      setPauseLabel('▶️ 继续生成')
      setLogs((prev) => [...prev, '已暂停'])
    }
  }

  const handleStopGenerate = () => {
    isStoppedRef.current = true
    isPausedRef.current = false
    setLogs((prev) => [...prev, '已终止生成'])
  }
  const handleGenerateTree = async () => {
    isPausedRef.current = false
    isStoppedRef.current = false
    setShowPauseControls(true)
    setPauseLabel('⏸️ 暂停生成')
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('http://127.0.0.1:8000/api/generate-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, depth: Number(depth), branch: Number(branch), classification_prompt: customPrompt, api_key: apiKey }),
      })
      if (!res.ok) throw new Error(`请求失败: ${res.status}`)
      const data = await res.json()
      setTree(data.tree)
      setLoading(false)
      await handleGenerateAll(data.tree)
      setShowPauseControls(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
      setShowPauseControls(false)
    }
  }

  const handleContextMenu = (e, node, parentTitle) => {
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, node, parentTitle })
  }

  const handleRegenerateNode = async () => {
    const node = contextMenu.node
    if (!node) return
    setContextMenu((prev) => ({ ...prev, visible: false }))
    setContentLoading(true)
    setContentError(null)
    try {
      const res = await fetch('http://127.0.0.1:8000/api/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: node.title, model_name: model, custom_ollama_model: model === 'ollama' ? selectedOllamaModel : '', api_key: apiKey }),
      })
      if (!res.ok) throw new Error(`请求失败: ${res.status}`)
      const data = await res.json()
      setContent(data.content)
      if (node) node.content = data.content
      if (node?.id) {
        setNodeContents((prev) => ({ ...prev, [node.id]: data.content }))
        setTree((prev) => updateTreeContent(prev, node.id, data.content))
      }
    } catch (err) {
      setContentError(err.message)
    } finally {
      setContentLoading(false)
    }
  }

  useEffect(() => {
    const hide = () => setContextMenu((prev) => ({ ...prev, visible: false }))
    window.addEventListener('click', hide)
    return () => window.removeEventListener('click', hide)
  }, [])

  const handleExport = async () => {
    if (!tree) {
      alert('请先生成认知树')
      return
    }
    const zip = new JSZip()
    const walk = (node, prefix) => {
      const safe = (node.title || 'node').replace(/[\\/:*?"<>|]/g, '_')
      const path = prefix ? `${prefix}/${safe}.md` : `${safe}.md`
      zip.file(path, node.content || nodeContents[node.id] || '')
      if (node.children && node.children.length > 0) {
        const nextPrefix = prefix ? `${prefix}/${safe}` : safe
        node.children.forEach((child) => walk(child, nextPrefix))
      }
    }
    walk(tree, '')
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `${topic}_认知树导出.zip`)
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const zip = await JSZip.loadAsync(file)
      const files = Object.keys(zip.files).filter((name) => !zip.files[name].dir)
      const nodePathsSet = new Set()
      const contentMap = new Map()
      for (const f of files) {
        const parts = f.split('/').filter(Boolean)
        const last = parts[parts.length - 1].replace(/\.md$/i, '')
        parts[parts.length - 1] = last
        for (let i = 1; i <= parts.length; i++) {
          nodePathsSet.add(parts.slice(0, i).join('/'))
        }
        const text = await zip.files[f].async('string')
        contentMap.set(parts.join('/'), text)
      }
      const nodesByKey = new Map()
      for (const key of nodePathsSet) {
        const segs = key.split('/')
        const node = { id: `imported-${key}`, title: segs[segs.length - 1], level: segs.length, children: [] }
        if (contentMap.has(key)) node.content = contentMap.get(key)
        nodesByKey.set(key, node)
      }
      const topLevelKeys = [...nodePathsSet].filter((k) => !k.includes('/'))
      let root
      if (topLevelKeys.length === 1) {
        root = nodesByKey.get(topLevelKeys[0])
      } else {
        root = { id: 'imported-root', title: topic || '导入的认知树', level: 0, children: [] }
        topLevelKeys.forEach((k) => root.children.push(nodesByKey.get(k)))
      }
      for (const key of nodePathsSet) {
        const idx = key.lastIndexOf('/')
        if (idx === -1) continue
        const parentKey = key.slice(0, idx)
        const parent = nodesByKey.get(parentKey)
        if (parent) parent.children.push(nodesByKey.get(key))
      }
      const newContents = {}
      for (const [key, node] of nodesByKey.entries()) {
        if (contentMap.has(key)) newContents[node.id] = contentMap.get(key)
      }
      setTree(root)
      setNodeContents(newContents)
    } catch (err) {
      setError(err.message)
    } finally {
      e.target.value = ''
    }
  }

  const updateTreeContent = (root, nodeId, content) => {
    if (!root) return root
    if (root.id === nodeId) {
      return { ...root, content }
    }
    if (root.children && root.children.length > 0) {
      return {
        ...root,
        children: root.children.map((child) => updateTreeContent(child, nodeId, content)),
      }
    }
    return root
  }

  const collectAllNodes = (node) => {
    if (!node) return []
    const result = [node]
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        result.push(...collectAllNodes(child))
      }
    }
    return result
  }

  const handleGenerateAll = async (treeArg = null) => {
    const targetTree = treeArg || tree
    if (!targetTree || isGeneratingAll) return
    const nodes = collectAllNodes(targetTree)
    if (nodes.length === 0) return
    setProgressTotal(nodes.length)
    setProgressDone(0)
    setIsGeneratingAll(true)
    setContentError(null)
    setLogs([])
    try {
      for (const node of nodes) {
        if (isStoppedRef.current) throw new Error('生成已终止')
        while (isPausedRef.current) {
          await new Promise((r) => setTimeout(r, 500))
          if (isStoppedRef.current) throw new Error('生成已终止')
        }
        setCurrentGenerating(node.title)
        setContent(`正在生成：${node.title}`)
        const selectedModel = model === 'ollama' ? selectedOllamaModel : model
        setLogs((prev) => [...prev, `[发送] 正在请求节点：${node.title}，使用模型：${selectedModel}`])
        setContentLoading(true)
        try {
          const res = await fetch('http://127.0.0.1:8000/api/generate-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: node.title,
              model_name: model,
              custom_ollama_model: model === 'ollama' ? selectedOllamaModel : '',
              api_key: apiKey,
            }),
          })
          if (!res.ok) throw new Error(`请求失败: ${res.status}`)
          const data = await res.json()
          setContent(data.content)
          if (node) node.content = data.content
          if (node?.id) {
            setNodeContents((prev) => ({ ...prev, [node.id]: data.content }))
            setTree((prev) => updateTreeContent(prev, node.id, data.content))
          }
          setLogs((prev) => [...prev, `[接收] 节点 ${node.title} 生成成功，返回内容长度：${data.content.length} 字符。预览：${(data.content || '').slice(0, 50)}`])
        } catch (err) {
          setContentError(err.message)
          setLogs((prev) => [...prev, `[错误] 节点 ${node.title} 生成失败：${err.message}`])
        } finally {
          setContentLoading(false)
        }
        setProgressDone((prev) => prev + 1)
      }
    } catch (err) {
      setLogs((prev) => [...prev, `[终止] ${err.message}`])
    } finally {
      setIsGeneratingAll(false)
      setCurrentGenerating('')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">快速认知工具</h1>
        <button
          type="button"
          onClick={() => {
            const pwd = window.prompt('请输入密码')
            if (pwd === null) return
            if (pwd.trim() === '') return
            if (pwd.trim().toLowerCase() !== topic.trim().toLowerCase()) return
            setShowPromptModal(true)
          }}
          className="bg-gray-200 text-gray-700 px-3 py-2 rounded hover:bg-gray-300 text-sm"
        >
          ⚙️ 设置分类提示词
        </button>
      </div>

      <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-4 mb-6 bg-white p-4 rounded-lg shadow">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">主题</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="border rounded px-3 py-2 w-48"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">层数</label>
          <input
            type="number"
            min={0}
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            className="border rounded px-3 py-2 w-20"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">分支数</label>
          <input
            type="number"
            min={1}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="border rounded px-3 py-2 w-20"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">大模型引擎</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="border rounded px-3 py-2 w-56"
          >
            <option value="kimi">Kimi</option>
            <option value="deepseek">DeepSeek V4-Pro</option>
            <option value="ollama">本地 Ollama</option>
          </select>
        </div>
        {model !== 'ollama' && (
          <button
            type="button"
            onClick={() => {
              setTempApiKey(apiKey)
              setShowApiKeyModal(true)
            }}
            className="bg-gray-200 text-gray-700 px-3 py-2 rounded hover:bg-gray-300 text-sm self-end"
          >
            ⚙️ 设置 API Key
          </button>
        )}
        {model === 'ollama' && (
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">本地模型</label>
            {ollamaModels.length > 0 ? (
              <div className="flex items-center gap-2">
                <select
                  value={selectedOllamaModel}
                  onChange={(e) => setSelectedOllamaModel(e.target.value)}
                  className="border rounded px-3 py-2 w-48"
                >
                  {ollamaModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('default_ollama_model', selectedOllamaModel)
                    setSaveLabel('已保存！')
                    setTimeout(() => setSaveLabel('设为默认'), 1500)
                  }}
                  className="bg-gray-200 text-gray-700 px-3 py-2 rounded hover:bg-gray-300 text-sm"
                >
                  {saveLabel}
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={selectedOllamaModel}
                onChange={(e) => setSelectedOllamaModel(e.target.value)}
                placeholder="qwen2.5"
                className="border rounded px-3 py-2 w-48"
              />
            )}
          </div>
        )}
        <button
          type="button"
          onClick={handleGenerateTree}
          disabled={loading || isGeneratingAll}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
        >
          {loading || isGeneratingAll ? '生成中...' : '生成认知树'}
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
        >
          📦 导出为压缩包
        </button>
        <label className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 cursor-pointer">
          📂 导入压缩包
          <input type="file" accept=".zip" onChange={handleImport} className="hidden" />
        </label>
      </form>

      {showPauseControls && (
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={handlePauseResume}
            className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
          >
            {pauseLabel}
          </button>
          <button
            type="button"
            onClick={handleStopGenerate}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            ⏹️ 终止生成
          </button>
        </div>
      )}

      {progressTotal > 0 && (
        <div className="mb-6 bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">已生成 {progressDone} / 共 {progressTotal} 个节点</span>
            {currentGenerating && <span className="text-sm text-gray-400">正在生成：{currentGenerating}</span>}
          </div>
          <div className="w-full bg-gray-200 rounded h-3 overflow-hidden">
            <div
              className="bg-blue-600 h-3 transition-all"
              style={{ width: `${progressTotal ? (progressDone / progressTotal) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <div
          ref={logRef}
          className="mb-6 h-48 overflow-y-auto bg-gray-900 text-green-400 font-mono text-sm p-3 rounded-lg"
        >
          {logs.map((line, idx) => (
            <div key={idx} className="whitespace-pre-wrap break-words">{line}</div>
          ))}
        </div>
      )}

      {error && <div className="text-red-600 mb-4">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg shadow min-h-[400px]">
          <h2 className="text-lg font-semibold mb-2">认知树</h2>
          {tree ? <TreeNode node={tree} parentTitle={null} onSelect={handleNodeSelect} onContextMenu={handleContextMenu} /> : <p className="text-gray-400">点击生成查看树状结构</p>}
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6 min-h-[400px]">
          <h2 className="text-lg font-semibold mb-4">详情</h2>
          {contentLoading ? (
            <p className="text-gray-400">Loading...</p>
          ) : contentError ? (
            <p className="text-red-600">{contentError}</p>
          ) : content ? (
          <div className="p-8 bg-white border border-gray-200 rounded-lg shadow-sm h-[calc(100vh-250px)] overflow-y-auto">
            <ReactMarkdown
              components={{
                h3: ({ node, ...props }) => <h3 className="text-xl font-bold text-gray-800 border-b-2 border-blue-100 pb-2 mb-4 mt-8" {...props} />,
                p: ({ node, ...props }) => <p className="text-gray-700 leading-7 mb-4 text-justify whitespace-pre-wrap" {...props} />,
                ul: ({ node, ...props }) => <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700" {...props} />,
                ol: ({ node, ...props }) => <ol className="list-decimal pl-6 mb-4 space-y-2 text-gray-700" {...props} />,
                li: ({ node, ...props }) => <li className="leading-6" {...props} />,
                strong: ({ node, ...props }) => <strong className="font-semibold text-gray-900 bg-blue-50 px-1 rounded" {...props} />,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
          ) : (
            <p className="text-gray-400">（右侧留白）</p>
          )}
        </div>
      </div>
      {showPromptModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-4">设置分类提示词</h2>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="请输入生成目录结构的分类规则（例如：第一层按认知过程分，第二层按理论/实验/应用分）"
              className="border rounded w-full h-40 p-3"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowPromptModal(false)}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">设置 API Key</h2>
            <label className="text-sm text-gray-600 mb-1 block">输入你的 DeepSeek 或 Kimi API Key</label>
            <input
              type="password"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="请输入 API Key"
              className="border rounded w-full px-3 py-2 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowApiKeyModal(false)}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setApiKey(tempApiKey)
                  localStorage.setItem('llm_api_key', tempApiKey)
                  setShowApiKeyModal(false)
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      {contextMenu.visible && (
        <div
          className="fixed bg-white border shadow-lg rounded z-50"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleRegenerateNode}
            className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
          >
            重新生成本节点
          </button>
        </div>
      )}
    </div>
  )
}

export default App
