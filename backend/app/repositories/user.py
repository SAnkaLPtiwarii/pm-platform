def like_pattern(term: str) -> str:
    """Build a safe `%term%` pattern: user-typed %, _ and \\ are matched literally."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
