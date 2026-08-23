(function (root, factory) {
  const api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TutorlyMarkdownRenderer = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderInlineMarkdown(value, richResponse) {
    const codeTokens = [];
    const mathTokens = [];
    const linkTokens = [];
    const unavailableImageTokens = [];
    let tokenized = String(value || "").replace(/`([^`]+)`/g, (_, code) => {
      codeTokens.push(`<code>${escapeHtml(code)}</code>`);
      return `@@TUTORLYCODE${codeTokens.length - 1}@@`;
    });
    tokenized = tokenized.replace(/\\\((.+?)\\\)|\$([^$\n]+)\$/g, (_, parenMath, dollarMath) => {
      const expression = parenMath || dollarMath || "";
      mathTokens.push(
        richResponse?.renderMath
          ? richResponse.renderMath(expression, false, escapeHtml)
          : `<span class="math-inline">${escapeHtml(expression)}</span>`
      );
      return `@@TUTORLYMATH${mathTokens.length - 1}@@`;
    });
    tokenized = tokenized.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_, label, href) => {
      linkTokens.push(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
      return `@@TUTORLYLINK${linkTokens.length - 1}@@`;
    });
    tokenized = tokenized.replace(
      /!\[([^\]]*)\]\(((?:attachment|sandbox|file):[^)\s]+)\)/gi,
      (_, label) => {
        unavailableImageTokens.push(
          richResponse?.renderUnavailableVisual
            ? richResponse.renderUnavailableVisual(label, true)
            : `<span class="tutorly-rich-notice tutorly-attachment-placeholder" role="status"><strong>${escapeHtml(label || "Requested diagram")} unavailable.</strong></span>`
        );
        return `@@TUTORLYUNAVAILABLEIMAGE${unavailableImageTokens.length - 1}@@`;
      }
    );

    let html = escapeHtml(tokenized)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>");
    codeTokens.forEach((token, index) => {
      html = html.replace(`@@TUTORLYCODE${index}@@`, () => token);
    });
    mathTokens.forEach((token, index) => {
      html = html.replace(`@@TUTORLYMATH${index}@@`, () => token);
    });
    linkTokens.forEach((token, index) => {
      html = html.replace(`@@TUTORLYLINK${index}@@`, () => token);
    });
    unavailableImageTokens.forEach((token, index) => {
      html = html.replace(`@@TUTORLYUNAVAILABLEIMAGE${index}@@`, () => token);
    });
    return html;
  }

  function splitMarkdownTableRow(line) {
    return String(line || "").trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  }

  function isMarkdownTableDivider(line) {
    const cells = splitMarkdownTableRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function renderUnsafe(markdown, richResponse) {
    const trustedHtml = String(markdown || "").trim();
    if (/^<section\s+class="math-learning-flow"\s+data-tutorly-math-response/i.test(trustedHtml)) {
      return trustedHtml;
    }

    const lines = trustedHtml.split(/\r?\n/);
    const html = [];
    let paragraph = [];
    let list = null;
    let codeBlock = null;

    function closeParagraph() {
      if (!paragraph.length) return;
      html.push(`<p>${renderInlineMarkdown(paragraph.join(" "), richResponse)}</p>`);
      paragraph = [];
    }

    function closeList() {
      if (!list) return;
      html.push(`<${list.type}>${list.items.map((item) => `<li>${renderInlineMarkdown(item, richResponse)}</li>`).join("")}</${list.type}>`);
      list = null;
    }

    function closeCodeBlock() {
      if (!codeBlock) return;
      if (richResponse?.renderCodeBlock) {
        html.push(richResponse.renderCodeBlock(codeBlock.language, codeBlock.lines.join("\n"), escapeHtml));
      } else {
        const language = codeBlock.language ? ` data-language="${escapeHtml(codeBlock.language)}"` : "";
        html.push(`<pre${language}><code>${escapeHtml(codeBlock.lines.join("\n"))}</code></pre>`);
      }
      codeBlock = null;
    }

    function renderDisplayMath(expression) {
      return richResponse?.renderMath
        ? richResponse.renderMath(expression, true, escapeHtml)
        : `<div class="math-display">${escapeHtml(expression)}</div>`;
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const rawLine = lines[lineIndex];
      const fence = rawLine.trim().match(/^```([a-z0-9_-]+)?$/i);
      if (fence) {
        if (codeBlock) closeCodeBlock();
        else {
          closeParagraph();
          closeList();
          codeBlock = { language: fence[1] || "", lines: [] };
        }
        continue;
      }

      if (codeBlock) {
        codeBlock.lines.push(rawLine);
        continue;
      }

      const line = rawLine.trim();
      if (!line) {
        closeParagraph();
        closeList();
        continue;
      }

      const unavailableImage = line.match(
        /^!\[([^\]]*)\]\(((?:attachment|sandbox|file):[^)\s]+)\)$/i
      );
      if (unavailableImage) {
        closeParagraph();
        closeList();
        html.push(
          richResponse?.renderUnavailableVisual
            ? richResponse.renderUnavailableVisual(unavailableImage[1])
            : `<div class="tutorly-rich-notice tutorly-attachment-placeholder" role="status"><strong>${escapeHtml(unavailableImage[1] || "Requested diagram")} unavailable.</strong></div>`
        );
        continue;
      }

      if (line === "$$" || line === "\\[") {
        const closingDelimiter = line === "$$" ? "$$" : "\\]";
        const mathLines = [];
        let mathIndex = lineIndex + 1;
        while (mathIndex < lines.length && lines[mathIndex].trim() !== closingDelimiter) {
          mathLines.push(lines[mathIndex]);
          mathIndex += 1;
        }
        if (mathIndex < lines.length) {
          closeParagraph();
          closeList();
          html.push(renderDisplayMath(mathLines.join("\n").trim()));
          lineIndex = mathIndex;
          continue;
        }
      }

      if (line.includes("|") && lines[lineIndex + 1] && isMarkdownTableDivider(lines[lineIndex + 1])) {
        closeParagraph();
        closeList();
        const headers = splitMarkdownTableRow(line);
        const rows = [];
        let rowIndex = lineIndex + 2;
        while (rowIndex < lines.length && lines[rowIndex].trim() && lines[rowIndex].includes("|")) {
          rows.push(splitMarkdownTableRow(lines[rowIndex]));
          rowIndex += 1;
        }
        html.push(`<div class="markdown-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell, richResponse)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, index) => `<td>${renderInlineMarkdown(row[index] || "", richResponse)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
        lineIndex = rowIndex - 1;
        continue;
      }

      const displayMath = line.match(/^\$\$(.+)\$\$$|^\\\[(.+)\\\]$/);
      if (displayMath) {
        closeParagraph();
        closeList();
        html.push(renderDisplayMath(displayMath[1] || displayMath[2] || ""));
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        closeParagraph();
        closeList();
        const level = heading[1].length;
        html.push(`<h${level}>${renderInlineMarkdown(heading[2], richResponse)}</h${level}>`);
        continue;
      }

      const blockquote = line.match(/^>\s+(.+)$/);
      if (blockquote) {
        closeParagraph();
        closeList();
        html.push(`<blockquote>${renderInlineMarkdown(blockquote[1], richResponse)}</blockquote>`);
        continue;
      }

      const orderedItem = line.match(/^\d+\.\s+(.+)$/);
      if (orderedItem) {
        closeParagraph();
        if (!list || list.type !== "ol") {
          closeList();
          list = { type: "ol", items: [] };
        }
        list.items.push(orderedItem[1]);
        continue;
      }

      const unorderedItem = line.match(/^[-*]\s+(.+)$/);
      if (unorderedItem) {
        closeParagraph();
        if (!list || list.type !== "ul") {
          closeList();
          list = { type: "ul", items: [] };
        }
        list.items.push(unorderedItem[1]);
        continue;
      }

      closeList();
      paragraph.push(line);
    }

    closeParagraph();
    closeList();
    closeCodeBlock();
    return html.join("");
  }

  function render(markdown, options = {}) {
    const originalSource = String(markdown || "");
    // A model may occasionally emit both a real rich visual fence and a fake
    // local attachment reference. Keep the renderable visual and discard only
    // the unavailable synthetic reference before parsing the rest of Markdown.
    const source = /```(?:mermaid|chart)\b/i.test(originalSource)
      ? originalSource.replace(
        /^\s*!\[[^\]]*\]\((?:attachment|sandbox|file):[^)\s]+\)\s*$/gim,
        ""
      )
      : originalSource;
    const richResponse = options.richResponse || root.TutorlyRichResponse || null;
    try {
      return renderUnsafe(source, richResponse);
    } catch (error) {
      // Rich formatting is optional. Preserve the educational answer if a
      // parser or renderer ever encounters an unexpected construct.
      return `<p>${escapeHtml(source).replace(/\r?\n/g, "<br>")}</p>`;
    }
  }

  return { escapeHtml, renderInlineMarkdown, render };
});
