# Interactive QA tool presentation

Public deck: https://kya24.github.io/sarj-qa/

11 Arabic slides, including four product-experience pages. Current screenshots use synthetic local booking data. Valid booking passes; reversed dates fail against an intentionally faulty local fixture. The time-saving example is hypothetical, not measured.

Space or Right advances; Left returns. Fullscreen and presenter view use the official HyperFrames controls. Motion is limited to purposeful staged reveals; reduced-motion preferences are respected. All fonts and runtime assets are bundled locally.

To edit: update `slide_content.py`, then run `python3 presentation/build.py` from the repository root and `bash scripts/bundle-presentation.sh`. After starting the app, run `CHROME_PATH=/path/to/chrome node presentation/verify.cjs` (requires the scripts' npm dependencies).

The standard is a methodology reference, not certification. OpenClaw Agent assisted development; Cloudflare/Llama provides optional drafting inside the product. Word content can be pasted as text; direct DOCX upload is not supported. Team accounts, an ERP module and a developer submissions portal remain proposed improvements.
