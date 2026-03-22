"""
Root conftest.py — ensures the backend/ directory is on sys.path so that
`from app.core.engine.generator import TaskGenerator` resolves correctly
when pytest is invoked from the project root or the backend/ directory.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
