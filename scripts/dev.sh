#!/usr/bin/env bash
# BM dev session — starts a tmux workspace at ~/Desktop/Tree/branchmanager-app
# Usage: ./scripts/dev.sh [session-name]
# Requires: tmux (brew install tmux)

SESSION="${1:-bm}"
DIR="$HOME/Desktop/Tree/branchmanager-app"

# If session already exists, just attach
tmux has-session -t "$SESSION" 2>/dev/null && exec tmux attach -t "$SESSION"

tmux new-session -d -s "$SESSION" -c "$DIR" -x 220 -y 50

# Pane 0 (left): file watcher — auto-rebuilds bundle on src/ changes
tmux send-keys -t "$SESSION:0" "node scripts/watch.mjs" Enter

# Split right: git / general terminal
tmux split-window -h -t "$SESSION:0" -c "$DIR"

# Top-right: ready for git / bump commands
tmux send-keys -t "$SESSION:0.1" "echo 'BM dev ready. Use: ./scripts/bump.sh <N> \"notes\" && git push'" Enter

# Split bottom-right: second terminal
tmux split-window -v -t "$SESSION:0.1" -c "$DIR"

# Focus top-right pane
tmux select-pane -t "$SESSION:0.1"

exec tmux attach -t "$SESSION"
