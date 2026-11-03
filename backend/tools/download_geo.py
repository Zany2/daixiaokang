"""Fetch official ip2region v3 offline databases; run from any directory."""
from pathlib import Path
from urllib.request import urlopen
import argparse
import os
from ip2region import util


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ipv6', action='store_true', help='Also download the IPv6 database')
    args = parser.parse_args()
    directory = Path(__file__).resolve().parents[1] / 'data/geo'
    directory.mkdir(parents=True, exist_ok=True)
    for version in ([4, 6] if args.ipv6 else [4]):
        filename = f'ip2region_v{version}.xdb'
        url = 'https://raw.githubusercontent.com/lionsoul2014/ip2region/master/data/' + filename
        target = directory / filename
        temporary = target.with_suffix('.download')
        try:
            with urlopen(url, timeout=90) as source, temporary.open('wb') as output:
                while chunk := source.read(1024 * 1024):
                    output.write(chunk)
            util.verify_from_file(str(temporary))
            os.replace(temporary, target)
            print('Installed:', target)
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
