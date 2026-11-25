interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  cellClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  page: number;
  onPageChange: (page: number) => void;
  hasMore: boolean;
  emptyMessage?: string;
  rowClassName?: (item: T) => string;
  showPagination?: boolean;
  minPage?: number;
}

export default function DataTable<T>({
  columns,
  data,
  keyExtractor,
  page,
  onPageChange,
  hasMore,
  emptyMessage = "No data found.",
  rowClassName,
  showPagination = true,
  minPage = 0,
}: DataTableProps<T>) {
  return (
    <div className="animate-fade-in">
      <div className="overflow-x-auto rounded-xl border border-base-600/50 bg-base-800/50 backdrop-blur-sm">
        <table className="min-w-full divide-y divide-base-600/50">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-widest text-base-300 font-body"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-base-700/50">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-sm text-base-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr
                  key={keyExtractor(item)}
                  className={`hover:bg-base-700/30 transition-colors duration-150 ${
                    rowClassName?.(item) ?? ""
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-6 py-4 text-sm text-base-100 ${
                        col.cellClassName ?? "whitespace-nowrap"
                      }`}
                    >
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="mt-5 flex items-center justify-between">
          <p className="text-sm text-base-400 font-mono">
            {data.length} result{data.length !== 1 && "s"} — page{" "}
            {minPage === 1 ? page : page + 1}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(Math.max(minPage, page - 1))}
              disabled={page <= minPage}
              className="rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={!hasMore}
              className="rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
