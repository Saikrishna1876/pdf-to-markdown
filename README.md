# file-to-markdown

A small Bun-based script that converts PDF and DOCX files to Markdown while preserving text and attempting to keep tables intact.

This project reads a PDF or DOCX file, extracts text and images, and outputs a single Markdown file. For PDFs, it also takes page screenshots to better understand the visual layout. An optional output path can be provided; otherwise the file is written to `output.md`.

## Supported File Types

- **PDF** (.pdf) - Full support with text extraction, image extraction, and page screenshots
- **DOCX** (.docx) - Support with text and image extraction

## Developer notes

- Install dependencies:

```bash
bun install
```

- Run (basic):

```bash
bun run index.ts <input.pdf|input.docx>
```

- Run (specify output path):

```bash
bun run index.ts <input.pdf|input.docx> /path/to/output.md
```

- Examples:

```bash
bun run index.ts ./example.pdf ./example.md
bun run index.ts ./document.docx ./document.md
```

## Notes

- This project was created with Bun. The script expects a PDF or DOCX file path as the first argument. An optional second argument specifies the output Markdown file path. If the second argument is omitted, the output will be written to `output.md` in the current working directory.

- The code uses `pdf-parse` for PDF parsing and `mammoth` for DOCX parsing (and other dependencies listed in `package.json`) to extract text and images that are used to help reconstruct tables and layout in Markdown.

- Bun automatically loads environment files, so no extra dotenv setup is required.

## License

MIT
