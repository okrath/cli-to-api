import type { ReactNode } from "react";

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
}

export function Table<T>({ columns, rows, rowKey, empty = "No rows" }: TableProps<T>) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-3 py-2 font-medium ${col.className ?? ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-t border-neutral-200 dark:border-neutral-800"
            >
              {columns.map((col) => (
                <td key={col.key} className={`px-3 py-2 align-top ${col.className ?? ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
