import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClockIcon,
  PlayIcon,
  StopIcon,
  BanknotesIcon,
  CreditCardIcon,
  CalculatorIcon,
  PrinterIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function Shifts() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [showStartModal, setShowStartModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);

  // Fetch current shift
  const { data: currentShift, isLoading: shiftLoading } = useQuery({
    queryKey: ['current-shift'],
    queryFn: () => api.get('/shifts/current').then(res => res.data)
  });

  // Fetch shift history
  const { data: shiftHistory } = useQuery({
    queryKey: ['shift-history'],
    queryFn: () => api.get('/shifts/history?limit=10').then(res => res.data)
  });

  // Start shift mutation
  const startShiftMutation = useMutation({
    mutationFn: (data) => api.post('/shifts/start', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['current-shift']);
      toast.success('Shift started successfully');
      setShowStartModal(false);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to start shift');
    }
  });

  // End shift mutation
  const endShiftMutation = useMutation({
    mutationFn: (data) => api.post('/shifts/end', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['current-shift']);
      queryClient.invalidateQueries(['shift-history']);
      toast.success('Shift ended successfully');
      setShowEndModal(false);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to end shift');
    }
  });

  const handleViewShift = (shift) => {
    setSelectedShift(shift);
    setShowHistoryModal(true);
  };

  const formatDuration = (startTime, endTime) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diff = end - start;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shift Management</h1>
          <p className="text-gray-500">Clock in/out and end-of-day reconciliation</p>
        </div>
      </div>

      {/* Current Shift Status */}
      <div className="bg-white rounded-xl p-6 border mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              currentShift ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              <ClockIcon className={`w-8 h-8 ${
                currentShift ? 'text-green-600' : 'text-gray-400'
              }`} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {currentShift ? 'Shift Active' : 'No Active Shift'}
              </h2>
              {currentShift ? (
                <>
                  <p className="text-gray-500">
                    Started at {new Date(currentShift.start_time).toLocaleTimeString()}
                  </p>
                  <p className="text-sm text-gray-400">
                    Duration: {formatDuration(currentShift.start_time)}
                  </p>
                </>
              ) : (
                <p className="text-gray-500">Start a shift to begin processing sales</p>
              )}
            </div>
          </div>

          {currentShift ? (
            <button
              onClick={() => setShowEndModal(true)}
              className="btn bg-red-500 text-white hover:bg-red-600 flex items-center gap-2"
            >
              <StopIcon className="w-5 h-5" />
              End Shift
            </button>
          ) : (
            <button
              onClick={() => setShowStartModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <PlayIcon className="w-5 h-5" />
              Start Shift
            </button>
          )}
        </div>

        {/* Current Shift Stats */}
        {currentShift && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 pt-6 border-t">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-gray-900">
                ${parseFloat(currentShift.total_sales || 0).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">Total Sales</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-gray-900">
                {currentShift.transaction_count || 0}
              </p>
              <p className="text-sm text-gray-500">Transactions</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-3xl font-bold text-green-600">
                ${parseFloat(currentShift.cash_sales || 0).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">Cash</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-3xl font-bold text-blue-600">
                ${parseFloat(currentShift.card_sales || 0).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">Card</p>
            </div>
          </div>
        )}
      </div>

      {/* Shift History */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-gray-500" />
            Recent Shifts
          </h3>
        </div>
        <div className="divide-y">
          {shiftHistory?.length > 0 ? (
            shiftHistory.map((shift) => (
              <div
                key={shift.shift_id}
                onClick={() => handleViewShift(shift)}
                className="p-4 hover:bg-gray-50 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                      <ClockIcon className="w-6 h-6 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {new Date(shift.start_time).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(shift.start_time).toLocaleTimeString()} - 
                        {shift.end_time ? new Date(shift.end_time).toLocaleTimeString() : 'Active'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {shift.employee_name} • {shift.location_name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      ${parseFloat(shift.total_sales || 0).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500">
                      {shift.transaction_count} transactions
                    </p>
                    {shift.variance !== 0 && shift.variance !== undefined && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        Math.abs(shift.variance) <= 1
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {shift.variance > 0 ? '+' : ''}${shift.variance?.toFixed(2)} variance
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-500">
              <ClockIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No shift history available</p>
            </div>
          )}
        </div>
      </div>

      {/* Start Shift Modal */}
      {showStartModal && (
        <StartShiftModal
          onClose={() => setShowStartModal(false)}
          onStart={(data) => startShiftMutation.mutate(data)}
          loading={startShiftMutation.isPending}
        />
      )}

      {/* End Shift Modal (EOD Reconciliation) */}
      {showEndModal && currentShift && (
        <EndShiftModal
          shift={currentShift}
          onClose={() => setShowEndModal(false)}
          onEnd={(data) => endShiftMutation.mutate(data)}
          loading={endShiftMutation.isPending}
        />
      )}

      {/* Shift History Detail Modal */}
      {showHistoryModal && selectedShift && (
        <ShiftDetailModal
          shift={selectedShift}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedShift(null);
          }}
        />
      )}
    </div>
  );
}

// Start Shift Modal
function StartShiftModal({ onClose, onStart, loading }) {
  const [openingCash, setOpeningCash] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onStart({
      opening_cash: parseFloat(openingCash) || 0
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">Start New Shift</h3>
          <button onClick={onClose}>
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Opening Cash in Drawer</label>
            <div className="relative">
              <BanknotesIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="number"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="input pl-10 text-xl"
                autoFocus
              />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Count the cash in your drawer before starting
            </p>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              Starting a shift will allow you to process sales. Remember to count your cash drawer accurately.
            </p>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 btn-primary flex items-center justify-center gap-2"
            >
              <PlayIcon className="w-5 h-5" />
              {loading ? 'Starting...' : 'Start Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// End Shift Modal (EOD Reconciliation)
function EndShiftModal({ shift, onClose, onEnd, loading }) {
  const [countedCash, setCountedCash] = useState('');
  const [notes, setNotes] = useState('');

  const expectedCash = (parseFloat(shift.opening_cash || 0) + parseFloat(shift.cash_sales || 0)).toFixed(2);
  const variance = countedCash ? (parseFloat(countedCash) - parseFloat(expectedCash)).toFixed(2) : '0.00';
  const hasVariance = Math.abs(parseFloat(variance)) > 0.01;

  const handleSubmit = (e) => {
    e.preventDefault();
    onEnd({
      counted_cash: parseFloat(countedCash) || 0,
      notes
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-xl font-semibold">End of Day Reconciliation</h3>
          <button onClick={onClose}>
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Shift Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Opening Cash</p>
              <p className="text-xl font-bold text-gray-900">
                ${parseFloat(shift.opening_cash || 0).toFixed(2)}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Total Sales</p>
              <p className="text-xl font-bold text-gray-900">
                ${parseFloat(shift.total_sales || 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h4 className="font-medium text-gray-700">Payment Breakdown</h4>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BanknotesIcon className="w-5 h-5 text-green-600" />
                <span>Cash Sales</span>
              </div>
              <span className="font-medium">${parseFloat(shift.cash_sales || 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCardIcon className="w-5 h-5 text-blue-600" />
                <span>Card Sales</span>
              </div>
              <span className="font-medium">${parseFloat(shift.card_sales || 0).toFixed(2)}</span>
            </div>
            <div className="pt-3 border-t flex items-center justify-between font-bold">
              <span>Expected Cash in Drawer</span>
              <span className="text-lg">${expectedCash}</span>
            </div>
          </div>

          {/* Cash Count */}
          <div>
            <label className="label">Counted Cash in Drawer *</label>
            <div className="relative">
              <CalculatorIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="number"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="input pl-10 text-xl"
                required
                autoFocus
              />
            </div>
          </div>

          {/* Variance Display */}
          {countedCash && (
            <div className={`p-4 rounded-lg flex items-center gap-3 ${
              hasVariance 
                ? Math.abs(parseFloat(variance)) <= 5 
                  ? 'bg-yellow-50' 
                  : 'bg-red-50'
                : 'bg-green-50'
            }`}>
              {hasVariance ? (
                <ExclamationTriangleIcon className={`w-6 h-6 ${
                  Math.abs(parseFloat(variance)) <= 5 ? 'text-yellow-600' : 'text-red-600'
                }`} />
              ) : (
                <CheckCircleIcon className="w-6 h-6 text-green-600" />
              )}
              <div>
                <p className={`font-medium ${
                  hasVariance 
                    ? Math.abs(parseFloat(variance)) <= 5 
                      ? 'text-yellow-800' 
                      : 'text-red-800'
                    : 'text-green-800'
                }`}>
                  {hasVariance ? (
                    <>Variance: {parseFloat(variance) > 0 ? '+' : ''}${variance}</>
                  ) : (
                    'Cash drawer balanced!'
                  )}
                </p>
                {hasVariance && (
                  <p className="text-sm opacity-80">
                    {Math.abs(parseFloat(variance)) <= 5 
                      ? 'Small variance - please add a note' 
                      : 'Large variance detected - manager approval may be required'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="label">Notes {hasVariance && '*'}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about the shift or explain variance..."
              rows={3}
              className="input resize-none"
              required={hasVariance}
            />
          </div>
        </form>

        <div className="flex items-center justify-between gap-3 p-6 border-t bg-gray-50">
          <button
            type="button"
            onClick={() => window.open(`/api/shifts/${shift.shift_id}/z-report`, '_blank')}
            className="btn btn-secondary flex items-center gap-2"
          >
            <PrinterIcon className="w-5 h-5" />
            Print Z-Report
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !countedCash}
              className="btn-primary flex items-center gap-2"
            >
              <StopIcon className="w-5 h-5" />
              {loading ? 'Ending...' : 'End Shift'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Shift Detail Modal
function ShiftDetailModal({ shift, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h3 className="text-xl font-semibold">Shift Details</h3>
            <p className="text-gray-500">
              {new Date(shift.start_time).toLocaleDateString()}
            </p>
          </div>
          <button onClick={onClose}>
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Time Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Start Time</p>
              <p className="font-medium">{new Date(shift.start_time).toLocaleTimeString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">End Time</p>
              <p className="font-medium">
                {shift.end_time ? new Date(shift.end_time).toLocaleTimeString() : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Employee</p>
              <p className="font-medium">{shift.employee_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Location</p>
              <p className="font-medium">{shift.location_name}</p>
            </div>
          </div>

          {/* Sales Summary */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h4 className="font-medium text-gray-700">Sales Summary</h4>
            <div className="flex justify-between">
              <span>Total Sales</span>
              <span className="font-bold">${parseFloat(shift.total_sales || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Transactions</span>
              <span className="font-medium">{shift.transaction_count || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Cash Sales</span>
              <span className="font-medium text-green-600">${parseFloat(shift.cash_sales || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Card Sales</span>
              <span className="font-medium text-blue-600">${parseFloat(shift.card_sales || 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Cash Reconciliation */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h4 className="font-medium text-gray-700">Cash Reconciliation</h4>
            <div className="flex justify-between">
              <span>Opening Cash</span>
              <span className="font-medium">${parseFloat(shift.opening_cash || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Expected Cash</span>
              <span className="font-medium">
                ${(parseFloat(shift.opening_cash || 0) + parseFloat(shift.cash_sales || 0)).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Counted Cash</span>
              <span className="font-medium">${parseFloat(shift.counted_cash || 0).toFixed(2)}</span>
            </div>
            {shift.variance !== undefined && (
              <div className="flex justify-between pt-2 border-t">
                <span>Variance</span>
                <span className={`font-bold ${
                  Math.abs(shift.variance) <= 1 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {shift.variance > 0 ? '+' : ''}${shift.variance?.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Notes */}
          {shift.notes && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Notes</p>
              <p className="p-3 bg-gray-50 rounded-lg text-gray-700">{shift.notes}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={() => window.open(`/api/shifts/${shift.shift_id}/z-report`, '_blank')}
            className="btn btn-secondary flex items-center gap-2"
          >
            <PrinterIcon className="w-5 h-5" />
            Print Z-Report
          </button>
          <button onClick={onClose} className="btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
