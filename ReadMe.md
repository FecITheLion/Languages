# Grammar2JSON Studio

A language and grammar work engine for turning grammar definitions into structured JSON through a guided, browser-based studio.

Grammar2JSON Studio combines a modern TypeScript/Vite development environment with a PHP-compatible PWA foundation, allowing the project to run in both development-oriented JavaScript environments and conventional PHP hosting environments.

## Overview

The project provides an interactive workspace for working with grammars, language definitions, parsing logic, and structured JSON output.

The `copilot/logic-guided-studio` branch includes the guided studio implementation along with a PHP/PWA foundation. 【1-9cc03b】

### Goals

- Define and edit language grammars
- Convert grammar-driven input into structured JSON
- Provide a guided interface for grammar development
- Keep parsing and transformation logic reusable
- Support browser/PWA deployment
- Support PHP-based hosting environments
- Provide testable language-processing components

## Project Structure

```text
.
├── public/
├── src/
├── test/
├── tests/
│
├── .env.example
├── .gitignore
│
├── api.php
├── index.html
├── index.php
├── install.php
│
├── PWA-PHP.md
│
├── package.json
├── bun.lock
├── server.ts
├── tsconfig.json
├── vite.config.ts
│
├── firebase-applet-config.json
└── metadata.json
