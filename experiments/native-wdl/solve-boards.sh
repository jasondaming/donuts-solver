#!/usr/bin/env bash
# Solve, certify, and map the first moves of every board in boards.txt (one 36-char arrow string per line).
# Usage: WDL=./wdl.exe ./solve-boards.sh > results.txt     (WDL defaults to ./wdl)
WDL=${WDL:-./wdl}
n=0
while read -r dirs; do
  dirs=${dirs%$'\r'}
  [ -z "$dirs" ] && continue
  n=$((n+1))
  solve=$(echo "" | DONUTS_BOARD=$dirs "$WDL" proof 25 "proof_board$n.txt" | tr -d '\r')
  verify=$(node --experimental-strip-types --no-warnings verify-proof.ts "proof_board$n.txt" "$dirs" 2>&1 | tail -1)
  vals=$(echo "" | DONUTS_BOARD=$dirs "$WDL" values 25 | tr -d '\r' | cut -d';' -f2)
  wins=$(echo "$vals" | tr ',' '\n' | grep -c '^1$')
  draws=$(echo "$vals" | tr ',' '\n' | grep -c '^0$')
  center=$(echo "$vals" | tr ',' '\n' | awk 'NR==15||NR==16||NR==21||NR==22' | grep -c '^1$')
  echo "board$n $dirs | $(echo "$solve" | head -1) | $(echo "$solve" | tail -1 | cut -d' ' -f2-4) | $verify | winningFirstMoves=$wins draws=$draws centerWins=$center | vals=$vals"
done < boards.txt
