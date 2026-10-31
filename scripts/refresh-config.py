import json
import re
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://hnf.jp-race.com/live/map'


def parse_config(html):
    match = re.search(r'streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)', html)
    if not match:
        raise RuntimeError('Original site configuration format changed')
    pool = json.loads(json.loads(match.group(1)))
    memo = {}

    def unpack(index):
        if index < 0:
            return None
        if index in memo:
            return memo[index]
        value = pool[index]
        if isinstance(value, dict):
            result = {}
            memo[index] = result
            for key, item in value.items():
                result[str(unpack(int(key[1:])))] = unpack(item)
            return result
        if isinstance(value, list):
            result = []
            memo[index] = result
            result.extend(unpack(item) if isinstance(item, int) else item for item in value)
            return result
        return value

    return unpack(0)['loaderData']['features/live/pages/map']


def validate_config(config):
    if not isinstance(config.get('wsUrl'), str) or not config['wsUrl'].startswith('wss://'):
        raise RuntimeError('Missing secure stream URL; keeping the previous configuration')
    session = config.get('sessionInfo')
    if not isinstance(session, dict) or not session.get('id'):
        raise RuntimeError('Missing session metadata; keeping the previous configuration')
    entries = config.get('entries')
    if not isinstance(entries, list):
        raise RuntimeError('Missing entry list; keeping the previous configuration')
    # The source publishes an empty roster for breaks and the end of the day.
    # Accept it only when the source explicitly declares zero entrants.
    if not entries and session.get('num_entries') != 0:
        raise RuntimeError('Entry list is empty but the session does not declare zero entrants')
    if not isinstance(config.get('wsProtocol', {}).get('packet'), dict):
        raise RuntimeError('Missing stream protocol; keeping the previous configuration')


def write_config(config, destination):
    validate_config(config)
    destination.write_text(json.dumps(config, ensure_ascii=False), encoding='utf-8')


def main():
    with urlopen(SOURCE_URL, timeout=20) as response:
        config = parse_config(response.read().decode())
    write_config(config, ROOT / 'config.json')
    print('Updated public viewer configuration:', config['sessionInfo']['session_name'],
          f"({len(config['entries'])} entries)")


if __name__ == '__main__':
    main()
