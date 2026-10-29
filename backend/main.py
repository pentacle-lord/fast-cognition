from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import requests
from openai import OpenAI

app = FastAPI(title="Fast Cognition API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateTreeRequest(BaseModel):
    topic: str = "认知心理学"
    depth: int = 2
    branch: int = 5
    classification_prompt: str = ""
    api_key: str = ""


class GenerateContentRequest(BaseModel):
    title: str = ""
    model_name: str = "kimi"
    custom_ollama_model: str = ""
    api_key: str = ""


class TreeNode(BaseModel):
    id: str
    title: str
    level: int
    children: List["TreeNode"] = []


TreeNode.model_rebuild()


_counter = {"n": 0}


def _new_id() -> str:
    _counter["n"] += 1
    return f"node-{_counter['n']}"


def generate_tree(topic: str, depth: int, branch: int, level: int = 0, classification_prompt: str = "") -> TreeNode:
    node = TreeNode(id=_new_id(), title=topic if level == 0 else f"{topic} - 分支 {level}", level=level, children=[])
    if level < depth:
        for i in range(branch):
            child_title = f"{topic} 子主题 {level + 1}-{i + 1}"
            node.children.append(generate_tree(child_title, depth, branch, level + 1))
    return node


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "fast-cognition"}


@app.post("/api/generate-tree")
def generate_tree_endpoint(req: GenerateTreeRequest):
    _counter["n"] = 0
    prompt = f"""你是一个顶级的知识架构师。请围绕主题《{req.topic}》，严格遵守以下分类规则：
【{req.classification_prompt}】
生成一个深度为 {req.depth}、每层分支数为 {req.branch} 的 JSON 树状结构。
注意：第一层的每个节点必须且只能是你根据规则提取的核心分类名称。第二层必须是具体的研究方向、应用场景或理论。绝对不要使用“子主题 1-1”、“分支 2”这种毫无意义的占位符命名。每个节点的标题必须是有实际意义的名词短语。
返回 JSON，结构为 {{"id": "...", "title": "...", "children": [{{"id": "...", "title": "...", "children": []}}]}}。"""
    resolved_key = req.api_key.strip() or os.getenv("LLM_API_KEY", "")
    tree = None
    try:
        client = OpenAI(base_url="https://api.deepseek.com", api_key=resolved_key)
        resp = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
        )
        raw = (resp.choices[0].message.content or "").strip()
        if raw.startswith("```"):
            raw = raw.strip().strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:].strip()
        data = json.loads(raw)

        def _dict_to_tree(d, level=0):
            if isinstance(d, list):
                d = d[0] if d else {}
            title = d.get("title") or d.get("name") or req.topic
            node = TreeNode(id=_new_id(), title=title, level=level, children=[])
            for c in d.get("children", []) or []:
                node.children.append(_dict_to_tree(c, level + 1))
            return node

        tree = _dict_to_tree(data, 0)
    except Exception:
        _counter["n"] = 0
        tree = generate_tree(req.topic, req.depth, req.branch, 0, req.classification_prompt)
    if tree is None:
        _counter["n"] = 0
        tree = generate_tree(req.topic, req.depth, req.branch, 0, req.classification_prompt)
    return {"topic": req.topic, "depth": req.depth, "branch": req.branch, "tree": tree.model_dump(), "prompt": prompt}


MODEL_CONFIG = {
    "kimi": {
        "base_url": "https://api.moonshot.cn/v1",
        "api_key": os.getenv("KIMI_API_KEY", ""),
        "model": "moonshot-v1-8k",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "api_key": os.getenv("DEEPSEEK_API_KEY", ""),
        "model": "deepseek-chat",
    },
    "ollama": {
        "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
        "api_key": os.getenv("OLLAMA_API_KEY", "ollama"),
        "model": os.getenv("OLLAMA_MODEL", "llama3"),
    },
}


def _get_client(model_name: str, custom_ollama_model: str = "", api_key: str = ""):
    resolved_key = api_key.strip() or os.getenv("LLM_API_KEY", "")
    if model_name == "ollama":
        actual_model = custom_ollama_model.strip() or "qwen3.5:9b"
        cfg = {
            "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
            "api_key": resolved_key or "ollama",
        }
        return OpenAI(base_url=cfg["base_url"], api_key=cfg["api_key"]), actual_model
    if model_name == "deepseek":
        cfg = {
            "base_url": "https://api.deepseek.com",
            "api_key": resolved_key,
        }
        return OpenAI(base_url=cfg["base_url"], api_key=cfg["api_key"]), "deepseek-chat"
    cfg = {
        "base_url": "https://api.moonshot.cn/v1",
        "api_key": resolved_key,
    }
    return OpenAI(base_url=cfg["base_url"], api_key=cfg["api_key"]), "moonshot-v1-8k"


@app.post("/api/generate-content")
def generate_content_endpoint(req: GenerateContentRequest):
    client, model = _get_client(req.model_name, req.custom_ollama_model, req.api_key)
    prompt = (
        f"请围绕主题「{req.title}」生成内容。\n"
        "必须严格按照以下三个 Markdown 标题输出，不要加多余的开场白：\n"
        "### 方法论（说明该节点的核心理论、底层逻辑或操作步骤）\n"
        "### 输入信息（说明运行该方法论需要什么前置条件、数据或资源）\n"
        "### 输出信息（说明该节点处理后会产生什么结果、价值或应用）\n"
        "请注意：如果内容包含多个要点（如 1) 2) 3)），请务必在每一个要点前面加上换行符（\\n），并且使用 Markdown 的有序列表格式（1. 2. 3.），而不要写在同一行里。\n"
    )
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
    )
    content = resp.choices[0].message.content or ""
    content = content.replace("\\n", "\n")
    return {"content": content, "model_name": req.model_name}

@app.get("/api/ollama-models")
def ollama_models():
    try:
        resp = requests.get("http://localhost:11434/api/tags", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        models = [m.get("name") for m in data.get("models", []) if m.get("name")]
        return {"models": models}
    except Exception:
        return {"models": []}