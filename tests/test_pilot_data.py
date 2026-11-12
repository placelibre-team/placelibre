import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pilot', ROOT / 'scripts/import_pilot_data.py')
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)

class PilotDataTests(unittest.TestCase):
    def test_snapshot_is_reproducible(self):
        self.assertEqual(pilot.build(), json.loads((ROOT / 'public/data/pilot-inventory.json').read_text()))

    def test_core_inventory_and_unknown_street(self):
        data = pilot.build()
        bricka = [r for r in data['meters'] if r['group'] == 'bricka']
        self.assertEqual({r['number'] for r in bricka}, {str(n) for n in range(250,260)})
        self.assertEqual(len([r for r in bricka if r['sharedAddress']]), 2)
        self.assertEqual([r for r in data['meters'] if r['group'] == 'saint-honorat'], [])
        for r in data['meters'] + data['parkings']:
            self.assertIsNone(r['coordinates'])
            self.assertIsNone(r['availability'])
            self.assertFalse(r['fieldVerified'])
            self.assertGreaterEqual(r['sourceRow'], 2)

    def test_capacity_is_parsed_not_inferred_from_global_totals(self):
        rows = {r['name']: r for r in pilot.build()['parkings']}
        self.assertEqual({k:r['capacity'] for k,r in rows.items()}, {'Courbet':141,'Dulys 1':81,'Dulys 2':71,'Gare Juan-les-Pins':17,'Nation':24})
        self.assertEqual(rows['Courbet']['pmr'], 6)
        self.assertIsNone(rows['Nation']['pmr'])
        self.assertEqual(len(set(r['id'] for r in rows.values())), 5)

    def test_malformed_inputs_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'bad.csv'
            p.write_text('wrong,header\n1,2\n')
            with self.assertRaises(ValueError): pilot.read_meters(p)
            with self.assertRaises(ValueError): pilot.read_parking(p)
            text = (ROOT / pilot.SOURCES[1]['file']).read_text()
            p.write_text(text.splitlines()[0] + '\ntruncated\n')
            with self.assertRaises(ValueError): pilot.read_parking(p)

if __name__ == '__main__': unittest.main()
