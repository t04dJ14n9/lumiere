#!/bin/bash
# Disposable-vault Obsidian 1.14.4 on the visible display :7 with CDP on 127.0.0.1:9444.
cd /tmp
DISPLAY=:7 exec /workspace/tools/obsidian-1.14.4/obsidian --remote-debugging-port=9444 --user-data-dir=/tmp/obsidian-config --no-sandbox --disable-gpu
