#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
setup_mcp.py
帮助用户在 Antigravity 中一键配置民政部地名库 MCP 服务 (mcp-china-geonames-server)
"""

import os
import sys
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MCP_SERVER_DIR = os.path.join(BASE_DIR, "mcp-china-geonames-server")
MCP_SERVER_PY = os.path.join(MCP_SERVER_DIR, "server.py")
GEMINI_CONFIG_PATH = os.path.expanduser("~/.gemini/config/mcp_config.json")

def main():
    print("=== Antigravity MCP 服务配置向导 ===")
    print(f"项目 MCP 服务脚本路径: {MCP_SERVER_PY}")

    if not os.path.exists(MCP_SERVER_PY):
        print(f"错误: 未找到 MCP 脚本文件 {MCP_SERVER_PY}")
        return

    config_data = {"mcpServers": {}}
    if os.path.exists(GEMINI_CONFIG_PATH):
        try:
            with open(GEMINI_CONFIG_PATH, "r", encoding="utf-8") as f:
                config_data = json.load(f)
                if "mcpServers" not in config_data:
                    config_data["mcpServers"] = {}
        except Exception as e:
            print(f"读取现有配置文件出错: {e}")

    # 注册 china-geonames
    config_data["mcpServers"]["china-geonames"] = {
        "command": sys.executable,
        "args": [MCP_SERVER_PY]
    }

    try:
        os.makedirs(os.path.dirname(GEMINI_CONFIG_PATH), exist_ok=True)
        with open(GEMINI_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config_data, f, ensure_ascii=False, indent=2)
        print(f"\n[成功] 已成功向 {GEMINI_CONFIG_PATH} 写入配置！")
        print("\n当前注册的 MCP 服务配置内容：")
        print(json.dumps({"china-geonames": config_data["mcpServers"]["china-geonames"]}, ensure_ascii=False, indent=2))
        print("\n提示：请确保已安装依赖包: pip3 install -r mcp-china-geonames-server/requirements.txt")
        print("之后重启或刷新 Antigravity，即可在对话中随时调用民政部地名库工具！")
    except Exception as e:
        print(f"\n[提示] 自动写入配置受系统权限限制: {e}")
        print("您可以手动将以下内容复制并保存至 ~/.gemini/config/mcp_config.json 文件中：")
        manual_config = {
            "mcpServers": {
                "china-geonames": {
                    "command": "python3",
                    "args": [MCP_SERVER_PY]
                }
            }
        }
        print(json.dumps(manual_config, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
