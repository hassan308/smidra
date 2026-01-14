import { memo } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const Pagination = memo(function Pagination({
  currentPage,
  totalPages,
  onPageChange
}: PaginationProps) {
  if (totalPages <= 1) return null;

  // Generate page numbers
  const pages: (number | string)[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else if (currentPage <= 3) {
    pages.push(1, 2, 3, 4, '...', totalPages);
  } else if (currentPage >= totalPages - 2) {
    pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
  } else {
    pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
  }

  return (
    <div className="flex justify-center items-center gap-1 py-6 pb-24">
      <Button
        variant="ghost"
        color="secondary"
        size="sm"
        uniform
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        ‹
      </Button>

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`dots-${i}`} className="px-2 text-gray-400">
            …
          </span>
        ) : (
          <Button
            key={p}
            variant={p === currentPage ? 'solid' : 'ghost'}
            color="secondary"
            size="sm"
            uniform
            className={p === currentPage ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : ''}
            onClick={() => onPageChange(p as number)}
          >
            {p}
          </Button>
        )
      )}

      <Button
        variant="ghost"
        color="secondary"
        size="sm"
        uniform
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        ›
      </Button>
    </div>
  );
});
