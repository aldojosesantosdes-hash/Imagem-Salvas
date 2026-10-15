#!/usr/bin/env bash
# Roda os testes do banco num Postgres local descartável: tests/run.sh [porta] [host-socket]
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${1:-5499}; HOST=${2:-/var/tmp}
P="psql -X -q -h $HOST -p $PORT -U postgres"
$P -c "drop database if exists caixa_test" -c "create database caixa_test"
$P -d caixa_test -v ON_ERROR_STOP=1 -f tests/shim_supabase.sql
$P -d caixa_test -v ON_ERROR_STOP=1 -f migrations/0001_init.sql
$P -d caixa_test -v ON_ERROR_STOP=1 -f tests/test_rls.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
