import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cx } from "./ui";

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cx(
        "prose prose-sm prose-zinc max-w-none dark:prose-invert",
        "prose-headings:font-semibold prose-a:text-indigo-600 dark:prose-a:text-indigo-400",
        "prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none dark:prose-code:bg-zinc-800",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
