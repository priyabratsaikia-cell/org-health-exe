# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec file for Org Health Agent backend.

Run: pyinstaller org-health.spec
Output: dist/org-health-backend/ (one-directory mode)
"""

import os
import sys
from pathlib import Path

block_cipher = None
project_root = os.path.abspath('.')

# Collect all app package files
app_data = [
    ('app', 'app'),
    ('data', 'data'),
]

# Ensure the built React frontend is included if it exists
react_dist = os.path.join(project_root, 'app', 'static', 'dist')
if os.path.isdir(react_dist):
    app_data.append(('app/static/dist', 'app/static/dist'))

a = Analysis(
    ['main.py'],
    pathex=[project_root],
    binaries=[],
    datas=app_data,
    hiddenimports=[
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'fastapi',
        'starlette',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.middleware.base',
        'starlette.responses',
        'starlette.routing',
        'starlette.staticfiles',
        'starlette.websockets',
        'pydantic',
        'pydantic_settings',
        'aiosqlite',
        'httpx',
        'websockets',
        'langgraph',
        'langchain_google_genai',
        'langchain_core',
        'multipart',
        'app.server',
        'app.config',
        'app.models',
        'app.database',
        'app.parameter_registry',
        'app.agent',
        'app.agent.graph',
        'app.agent.nodes',
        'app.agent.state',
        'app.services',
        'app.services.salesforce',
        'app.services.llm',
        'app.services.scoring_engine',
        'app.services.code_analyzer',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'numpy',
        'pandas',
        'scipy',
        'PIL',
        'cv2',
        'torch',
        'tensorflow',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='main',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=os.path.join(project_root, 'build', 'icon.ico')
    if os.path.exists(os.path.join(project_root, 'build', 'icon.ico'))
    else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='org-health-backend',
)
