---
trigger: always_on
---

# Kubernetes Labs & Website Standards

1. **No ASCII Text Art:** Never use ASCII box-drawing diagrams (`┌`, `─`, `│`, `+---+`) in `Lab_*/README.md` or `site/`. Use clean HTML/SVG diagrams or Mermaid flowcharts instead.
2. **Individual Copyable Commands:** In `site/`, render multi-line shell command blocks (`bash`, `powershell`) as individual command lines, each with its own prompt (`$` / `PS>`) and Copy button.
3. **Experience-Sharing Voice:** Write lab explanations in a natural, first-person exploratory tone ("why before what", relatable analogies, and `Hook -> Break -> Fix -> Verify` micro-stories) instead of stiff textbook boilerplate.
4. **Screenshot Guidance:** Label lab screenshots clearly with when to capture and human-readable filenames (e.g., `01 Cluster Status.png`, not `01_cluster_status.png`).
5. **No Academic Syllabus on Homepage:** Keep `CO-1` to `CO-6`, `M1` to `M6`, and university assessment metadata off the homepage (`index.html`).
