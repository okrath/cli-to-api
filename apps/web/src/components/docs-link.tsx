export function DocsLink({ anchor }: { anchor: string }) {
  return (
    <a
      href={`https://github.com/okrath/cli-to-api#${anchor}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-normal text-blue-600 hover:underline dark:text-blue-400"
    >
      Docs ↗
    </a>
  );
}
