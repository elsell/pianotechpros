#!/usr/bin/env bash
# Exact native services for disposable CI/remote acceptance; never deployment.
set -euo pipefail
prefix="${1:?absolute isolated installation directory required}"
[[ "$prefix" == /* && ! -e "$prefix" ]] || { echo 'Use a new absolute installation directory' >&2; exit 1; }
case "$(uname -s)-$(uname -m)" in
 Darwin-arm64) platform=darwin_arm64; spice_sha=af91d56cc8093f5dd003ef21fb46715c7803ec3c6b81a30f25bf5d05a2881ec7 ;;
 Darwin-x86_64) platform=darwin_amd64; spice_sha=f99e1c15bc411d066e7d2dd1a700a97c768f9f645e5827972c2603b29c8f2a63 ;;
 Linux-x86_64) platform=linux_amd64; spice_sha=ba276d5c7e222dfdd06700a1514f614e38a4bd95eccbe2be129433155d8a7c9b ;;
 *) echo 'Unsupported native acceptance platform' >&2; exit 1 ;;
esac
# These are supplied by the hosted compiler/SDK image; fail before downloads.
for command in cc make bison flex perl curl python3 tar; do
 command -v "$command" >/dev/null || { echo "Missing native build prerequisite: $command" >&2; exit 1; }
done
mkdir -p "$prefix/bin"
work="$(mktemp -d "${TMPDIR:-/tmp}/piano-service-build.XXXXXX")"
trap 'rm -rf "$work"' EXIT
fetch() {
 curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --location --silent --show-error --connect-timeout 10 --max-time 300 "$1" -o "$2"
 python3 - "$2" "$3" <<'PY'
import hashlib,sys
from pathlib import Path
if hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest()!=sys.argv[2]:
    raise SystemExit('Native service archive checksum mismatch')
PY
}
fetch https://ftp.postgresql.org/pub/source/v18.4/postgresql-18.4.tar.bz2 "$work/postgres.tar.bz2" 81a81ec695fb0c7901407defaa1d2f7973617154cf27ba74e3a7ab8e64436094
fetch "https://github.com/authzed/spicedb/releases/download/v1.54.0/spicedb_1.54.0_${platform}.tar.gz" "$work/spicedb.tar.gz" "$spice_sha"
tar -xjf "$work/postgres.tar.bz2" -C "$work"
(cd "$work/postgresql-18.4" && ./configure --prefix="$prefix" --without-icu --without-readline --without-zlib --without-lz4 --without-zstd && make -j2 && make install)
tar -xzf "$work/spicedb.tar.gz" -C "$prefix/bin" spicedb
"$prefix/bin/postgres" --version | grep -Fx 'postgres (PostgreSQL) 18.4'
"$prefix/bin/spicedb" version | grep -F 'v1.54.0'
