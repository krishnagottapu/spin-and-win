'use client';

import { useState, useEffect } from 'react';
import type { Prize } from '@/lib/types';

interface LivePrizeManagerProps {
  sessionId: string;
}

export default function LivePrizeManager({ sessionId }: LivePrizeManagerProps) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Fetch prizes on mount
  useEffect(() => {
    async function fetchPrizes() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setPrizes(data.session?.prizes ?? []);
      } catch {
        setError('Failed to load prizes');
      } finally {
        setLoading(false);
      }
    }
    fetchPrizes();
  }, [sessionId]);

  async function handleUpdate(prizeId: string, updates: { name?: string; weight?: number; inventory_count?: number }) {
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/prizes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prize_id: prizeId, ...updates }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Update failed');
        return;
      }

      const { prize } = await res.json();
      setPrizes((prev) => prev.map((p) => (p.id === prize.id ? prize : p)));
      setEditingId(null);
    } catch {
      setError('Network error');
    }
  }

  async function handleAdd(newPrize: { name: string; weight: number; inventory_count: number }) {
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/prizes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrize),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to add prize');
        return;
      }

      const { prize } = await res.json();
      setPrizes((prev) => [...prev, prize]);
      setShowAddForm(false);
    } catch {
      setError('Network error');
    }
  }

  if (loading) {
    return <div className="animate-pulse rounded bg-gray-100 p-4 text-sm text-gray-500">Loading prizes...</div>;
  }

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Live Prize Management</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
        >
          {showAddForm ? 'Cancel' : '+ Add Prize'}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
      )}

      {/* Add prize form */}
      {showAddForm && (
        <AddPrizeForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
      )}

      {/* Prize list */}
      <div className="space-y-2">
        {prizes.map((prize) => (
          <PrizeRow
            key={prize.id}
            prize={prize}
            isEditing={editingId === prize.id}
            onEdit={() => setEditingId(prize.id)}
            onSave={(updates) => handleUpdate(prize.id, updates)}
            onCancel={() => setEditingId(null)}
          />
        ))}
      </div>

      {prizes.length === 0 && (
        <p className="text-center text-sm text-gray-400">No prizes configured</p>
      )}
    </div>
  );
}

// ─── Prize Row ────────────────────────────────────────────────────────────────

interface PrizeRowProps {
  prize: Prize;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (updates: { name?: string; weight?: number; inventory_count?: number }) => void;
  onCancel: () => void;
}

function PrizeRow({ prize, isEditing, onEdit, onSave, onCancel }: PrizeRowProps) {
  const [name, setName] = useState(prize.name);
  const [weight, setWeight] = useState(prize.weight);
  const [inventory, setInventory] = useState(prize.inventory_count);

  useEffect(() => {
    setName(prize.name);
    setWeight(prize.weight);
    setInventory(prize.inventory_count);
  }, [prize]);

  if (!isEditing) {
    return (
      <div className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-800">{prize.name}</span>
          {prize.is_no_prize && (
            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">No Prize</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">W: {prize.weight}</span>
          <span className={`text-xs font-medium ${prize.inventory_count === 0 ? 'text-red-600' : 'text-gray-600'}`}>
            Inv: {prize.inventory_count}
          </span>
          <button
            onClick={onEdit}
            className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-blue-300 bg-blue-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          placeholder="Name"
        />
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">W:</label>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
            min={1}
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">Inv:</label>
          <input
            type="number"
            value={inventory}
            onChange={(e) => setInventory(Number(e.target.value))}
            className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
            min={0}
          />
        </div>
        <button
          onClick={() => onSave({ name, weight, inventory_count: inventory })}
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Add Prize Form ───────────────────────────────────────────────────────────

interface AddPrizeFormProps {
  onAdd: (prize: { name: string; weight: number; inventory_count: number }) => void;
  onCancel: () => void;
}

function AddPrizeForm({ onAdd, onCancel }: AddPrizeFormProps) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState(1);
  const [inventory, setInventory] = useState(10);

  return (
    <div className="mb-3 rounded border border-green-300 bg-green-50 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          placeholder="Prize name"
          autoFocus
        />
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">W:</label>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
            min={1}
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">Inv:</label>
          <input
            type="number"
            value={inventory}
            onChange={(e) => setInventory(Number(e.target.value))}
            className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
            min={1}
          />
        </div>
        <button
          onClick={() => {
            if (!name.trim()) return;
            onAdd({ name: name.trim(), weight, inventory_count: inventory });
          }}
          className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
