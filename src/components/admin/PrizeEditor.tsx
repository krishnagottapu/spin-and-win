'use client';

import type { CreatePrizeInput } from '@/lib/types';

interface PrizeEditorProps {
  prizes: CreatePrizeInput[];
  onChange: (prizes: CreatePrizeInput[]) => void;
}

export default function PrizeEditor({ prizes, onChange }: PrizeEditorProps) {
  function addPrize() {
    onChange([
      ...prizes,
      { name: '', weight: 1, inventory_count: 1, is_no_prize: false },
    ]);
  }

  function removePrize(index: number) {
    const updated = prizes.filter((_, i) => i !== index);
    onChange(updated);
  }

  function updatePrize(index: number, field: keyof CreatePrizeInput, value: string | number | boolean) {
    const updated = prizes.map((prize, i) => {
      if (i !== index) return prize;
      return { ...prize, [field]: value };
    });
    onChange(updated);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Prizes</h3>
        <button
          type="button"
          onClick={addPrize}
          className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
        >
          Add Prize
        </button>
      </div>

      {prizes.length === 0 && (
        <p className="text-sm text-gray-500">
          No prizes added. Click &quot;Add Prize&quot; to start.
        </p>
      )}

      {prizes.map((prize, index) => (
        <div
          key={index}
          className="rounded-md border border-gray-200 bg-gray-50 p-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Name
              </label>
              <input
                type="text"
                value={prize.name}
                onChange={(e) => updatePrize(index, 'name', e.target.value)}
                placeholder="Prize name"
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Weight
              </label>
              <input
                type="number"
                min="1"
                value={prize.weight}
                onChange={(e) =>
                  updatePrize(index, 'weight', parseInt(e.target.value, 10) || 1)
                }
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Inventory
              </label>
              <input
                type="number"
                min="1"
                value={prize.inventory_count}
                onChange={(e) =>
                  updatePrize(
                    index,
                    'inventory_count',
                    parseInt(e.target.value, 10) || 1
                  )
                }
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={prize.is_no_prize ?? false}
                  onChange={(e) =>
                    updatePrize(index, 'is_no_prize', e.target.checked)
                  }
                  className="rounded border-gray-300"
                />
                No Prize
              </label>
              <button
                type="button"
                onClick={() => removePrize(index)}
                className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
