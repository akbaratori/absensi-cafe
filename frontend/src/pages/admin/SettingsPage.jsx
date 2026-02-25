import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Clock, MapPin } from 'lucide-react';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import Input from '../../components/shared/Input';
import api from '../../services/api';

const SettingsPage = () => {
  const [settings, setSettings] = useState({
    workStartTime: '08:00',
    workEndTime: '17:00',
    lateGraceMinutes: '15',
    autoClockoutHours: '10',
    cafeLatitude: '-6.2088',
    cafeLongitude: '106.8456',
    radiusMeters: '100',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/admin/config');
      setSettings(response.data.data);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings.' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await api.put('/admin/config', settings);
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset to defaults?')) return;

    // In a real app, you might have a reset endpoint or just hardcode defaults
    // For now, let's reload the page to fetch fresh (if supported) or just set state
    setSettings({
      workStartTime: '08:00',
      workEndTime: '17:00',
      lateGraceMinutes: '15',
      autoClockoutHours: '10',
      cafeLatitude: '-6.2088',
      cafeLongitude: '106.8456',
      radiusMeters: '100',
    });
    setMessage({ type: 'info', text: 'Settings reset to defaults (unsaved).' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Configure system-wide attendance settings</p>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-4 rounded-md ${message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
            : message.type === 'error'
              ? 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
              : 'bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
            }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="space-y-6">
          {/* Working Hours Settings */}
          <Card>
            <Card.Header>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Working Hours</h3>
              </div>
            </Card.Header>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Work Start Time
                  </label>
                  <Input
                    type="time"
                    name="workStartTime"
                    value={settings.workStartTime}
                    onChange={handleChange}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Default time when work day starts
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Work End Time
                  </label>
                  <Input
                    type="time"
                    name="workEndTime"
                    value={settings.workEndTime}
                    onChange={handleChange}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Default time when work day ends
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Location Settings */}
          <Card>
            <Card.Header>
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Location Settings</h3>
              </div>
            </Card.Header>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Cafe Latitude
                  </label>
                  <Input
                    type="text"
                    name="cafeLatitude"
                    value={settings.cafeLatitude}
                    onChange={handleChange}
                    placeholder="-6.2088"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Cafe Longitude
                  </label>
                  <Input
                    type="text"
                    name="cafeLongitude"
                    value={settings.cafeLongitude}
                    onChange={handleChange}
                    placeholder="106.8456"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Allowed Radius (Meters)
                  </label>
                  <Input
                    type="number"
                    name="radiusMeters"
                    value={settings.radiusMeters}
                    onChange={handleChange}
                    min="10"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Maximum distance allowed for employees to clock in
                  </p>
                </div>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Tip:</strong> Get coordinates from Google Maps (right-click a location).
                </p>
              </div>
            </div>
            <div className="px-6 pb-6 pt-0">
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-green-600" />
                  Active System Location
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="block text-gray-500 dark:text-gray-400">Current Latitude</span>
                    <span className="font-mono text-gray-900 dark:text-white">{settings.cafeLatitude || 'Not Set'}</span>
                  </div>
                  <div>
                    <span className="block text-gray-500 dark:text-gray-400">Current Longitude</span>
                    <span className="font-mono text-gray-900 dark:text-white">{settings.cafeLongitude || 'Not Set'}</span>
                  </div>
                </div>
                {settings.cafeLatitude && settings.cafeLongitude && (
                  <div className="mt-3 text-right">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${settings.cafeLatitude},${settings.cafeLongitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium inline-flex items-center"
                    >
                      View on Google Maps &rarr;
                    </a>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Late Policy Settings */}
          <Card>
            <Card.Header>
              <div className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Late Policy</h3>
              </div>
            </Card.Header>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Grace Period (minutes)
                </label>
                <Input
                  type="number"
                  name="lateGraceMinutes"
                  value={settings.lateGraceMinutes}
                  onChange={handleChange}
                  min="0"
                  max="60"
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Employees won't be marked late if they clock in within this many minutes after start time
                </p>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Example:</strong> If work starts at 08:00 and grace period is 15 minutes,
                  employees will be marked "Present" until 08:15. After 08:15, they will be marked "Late".
                </p>
              </div>
            </div>
          </Card>

          {/* Auto-Clockout Settings */}
          <Card>
            <Card.Header>
              <div className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Auto-Clockout</h3>
              </div>
            </Card.Header>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Auto-Clockout After (hours)
                </label>
                <Input
                  type="number"
                  name="autoClockoutHours"
                  value={settings.autoClockoutHours}
                  onChange={handleChange}
                  min="1"
                  max="24"
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Automatically clock out employees who forget to clock out after this many hours
                </p>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  <strong>Note:</strong> This setting helps prevent incorrect attendance records when
                  employees forget to clock out at the end of their shift.
                </p>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleReset}
              disabled={saving}
            >
              Reset to Defaults
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
            >
              <Save className="w-4 h-4 mr-2" />
              Save Settings
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default SettingsPage;
