"""Guards for the layered design (see README "Architecture").

    api  ->  services  ->  repositories  ->  models        core/domain: used by all

These fail if a change quietly breaks the layering, e.g. a service starting to
raise HTTP errors or a route building SQL queries again.
"""

import ast
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[1] / "app"


def python_files(*packages: str) -> list[Path]:
    return [f for pkg in packages for f in sorted((APP / pkg).rglob("*.py"))]


def imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def rel(path: Path) -> str:
    return str(path.relative_to(APP.parent)).replace("\\", "/")


@pytest.mark.parametrize("package", ["services", "repositories", "domain", "core"])
def test_inner_layers_know_nothing_about_http(package):
    """Business code must be usable outside a web request (scripts, workers, tests)."""
    offenders = [
        f"{rel(f)} imports {m}"
        for f in python_files(package)
        for m in imported_modules(f)
        if m.split(".")[0] in {"fastapi", "starlette"} or m.startswith("app.api")
    ]
    # core/middleware.py and core/observability.py are plain ASGI (no FastAPI imports), so they pass too.
    assert offenders == []


def test_domain_depends_on_nothing_in_the_app():
    offenders = [
        f"{rel(f)} imports {m}" for f in python_files("domain") for m in imported_modules(f) if m.startswith("app.")
    ]
    assert offenders == []


def test_repositories_do_not_depend_on_services():
    offenders = [
        f"{rel(f)} imports {m}"
        for f in python_files("repositories")
        for m in imported_modules(f)
        if m.startswith("app.services")
    ]
    assert offenders == []


def test_only_repositories_run_queries():
    """Every SQL query lives in app/repositories (one place to optimise or change databases)."""
    offenders = []
    for f in sorted(APP.rglob("*.py")):
        if "repositories" in f.parts:
            continue
        for node in ast.walk(ast.parse(f.read_text(encoding="utf-8"))):
            is_query = isinstance(node, ast.Attribute) and node.attr == "query"
            if is_query and isinstance(node.value, (ast.Name, ast.Attribute)):
                owner = node.value.id if isinstance(node.value, ast.Name) else node.value.attr
                if owner in {"db", "session"}:
                    offenders.append(f"{rel(f)}:{node.lineno}")
    assert offenders == []


def test_routes_do_not_raise_http_exceptions():
    """Routes raise domain errors (or return redirects); app/api/errors.py maps them to status codes."""
    offenders = [
        f"{rel(f)} imports HTTPException"
        for f in python_files("api")
        if "HTTPException" in f.read_text(encoding="utf-8")
    ]
    assert offenders == []
