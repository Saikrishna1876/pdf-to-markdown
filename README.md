# pdf-to-markdown

A small Bun-based script that converts PDF files to Markdown while preserving text and attempting to keep tables intact.

This project reads a PDF, takes page screenshots, extracts text, and outputs a single Markdown file. An optional output path can be provided; otherwise the file is written to `output.md`.

## Developer notes

- Install dependencies:

```bash
bun install
```

- Run (basic):

```bash
bun run index.ts <input.pdf>
```

- Run (specify output path):

```bash
bun run index.ts <input.pdf> /path/to/output.md
```

- Example:

```bash
bun run index.ts ./example.pdf ./example.md
```

## Notes

- This project was created with Bun. The script expects a PDF file path as the first argument. An optional second argument specifies the output Markdown file path. If the second argument is omitted, the output will be written to `output.md` in the current working directory.

- The code uses `pdf-parse` (and other dependencies listed in `package.json`) to parse the PDF and produce both text and page images that are used to help reconstruct tables and layout in Markdown.

- Bun automatically loads environment files, so no extra dotenv setup is required.

## License

MIT
