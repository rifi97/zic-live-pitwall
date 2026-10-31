"""Regression checks for a valid zero-entry session and an incomplete roster."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('refresh_config', Path(__file__).with_name('refresh-config.py'))
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class SessionRefreshTests(unittest.TestCase):
    def config(self, count, entries):
        return {'wsUrl': 'wss://example.test', 'sessionInfo': {'id': 'session', 'num_entries': count},
                'wsProtocol': {'packet': {}}, 'entries': entries}

    def test_declared_zero_entries_is_published(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'config.json'
            refresh.write_config(self.config(0, []), path)
            self.assertEqual(json.loads(path.read_text())['entries'], [])

    def test_missing_roster_keeps_previous_config(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'config.json'
            path.write_text('previous valid configuration')
            for entries in ([], None):
                with self.assertRaises(RuntimeError):
                    refresh.write_config(self.config(16, entries), path)
                self.assertEqual(path.read_text(), 'previous valid configuration')


if __name__ == '__main__':
    unittest.main()
