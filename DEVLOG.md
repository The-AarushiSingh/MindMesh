### Bootstrap the project
**Muscle Memory**: TypeScript Setup

npm init -y → creates an empty package.json.
npm i -D typescript → installs TypeScript as a development dependency.
npx tsc --init → generates tsconfig.json.
Update tsconfig.json:
rootDir → where the TypeScript source files live.
outDir → where the compiled JavaScript files should go.
For example:

{
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  }
}

Earlier, while building backends with JavaScript, we commonly used:

const express = require("express");

With TypeScript, we can use the more modern ES Module import syntax:

import express from "express";

Create the src directory (our rootDir) and add:

src/
└── index.ts

What are .d.ts files?
Now there's an interesting problem: we're using Express in a TypeScript project, but Express itself is written in JavaScript.

TypeScript needs type information to understand things like:

What functions does Express provide?
What arguments do those functions accept?
What do they return?
Express was originally published without TypeScript type definitions. So, separate type declaration files were created for it.

That's where .d.ts files come in.

We can install Express's type definitions separately:

npm i -D @types/express

The @types/express package provides TypeScript with the necessary type information for Express.

So, conceptually:

express
   ↓
JavaScript implementation

@types/express
   ↓
TypeScript type declarations (.d.ts)

And when TypeScript complains about something we intentionally want to bypass, we can use:

// @ts-ignore

This tells TypeScript to ignore the error on the next line.