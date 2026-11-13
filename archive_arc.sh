mkdir -p docs/archive/legacy-csharp
if [ -d "Arc.Cognitive" ]; then
    zip -r docs/archive/legacy-csharp/Arc.Cognitive.zip Arc.Cognitive
    rm -rf Arc.Cognitive
else
    echo "Arc.Cognitive not found, creating dummy zip for consistency if needed, or just skipping."
    # We will just skip the zip if it's not there, but create a placeholder readme
    echo "Arc.Cognitive was previously removed. Archive entry." > docs/archive/legacy-csharp/README.md
fi
