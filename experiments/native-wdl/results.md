# Results: the 23 boards from the May 2026 solver cache

Each board was solved from the empty board, and the winner's full strategy was then certified with the app's JS rules (`verify-proof.ts`).
All 36 first moves were also solved individually. Timings are for one core of an i7-9700KF with a 2^25-entry table.

| Board | Arrows (row-major) | Winner | Root solve | Nodes | First moves that win / draw | Center squares that win | Certified positions |
|---|---|---|---|---|---|---|---|
| 1 | `ADHHAHVVHVVHHDADADDDADHVVHHADAVDAHVD` | vanilla | 1.03 s | 4,507,363 | 10 / 1 | 2 of 4 | 1,037,525 |
| 2 | `ADHHHAHVVAVAHDADVDDHVDADADAHVVHVDHAH` | vanilla | 2.17 s | 8,762,326 | 10 / 0 | 1 of 4 | 226,479 |
| 3 | `VVDVVAAHADHDDHVVHADVHDDAADAVHHVHDVDA` | vanilla | 1.13 s | 4,566,197 | 8 / 0 | 2 of 4 | 43,557 |
| 4 | `ADHDHVVVHADAHDAHVDAHVADVDHDHHVAVVADD` | vanilla | 3.43 s | 13,696,101 | 7 / 2 | 0 of 4 | 615,325 |
| 5 | `ADVAHVHHVDHDADDAVVADHDVHVVHADAHDAVHD` | vanilla | 1.27 s | 5,093,549 | 11 / 0 | 2 of 4 | 470,796 |
| 6 | `ADHHAHVVHVVHHDADADDDADVHVHHADAVDAVHD` | vanilla | 0.92 s | 3,933,143 | 11 / 0 | 2 of 4 | 562,646 |
| 7 | `VDAADHHAVHVVADHHDAHHAHAHAVAVVHDVDDAD` | vanilla | 0.79 s | 3,500,284 | 9 / 0 | 1 of 4 | 176,600 |
| 8 | `VDAADVHAVHHVADHADDADHVVAHVVDHDHDAVHA` | vanilla | 0.34 s | 1,629,669 | 15 / 0 | 2 of 4 | 123,525 |
| 9 | `ADHDHVHVVADAHDAHVDAHVADVDHDHHVAVVADD` | vanilla | 4.67 s | 19,783,749 | 9 / 0 | 0 of 4 | 469,892 |
| 10 | `DADDVDHVVAVAHAHAHHADHDVHVVHADAHDAVHD` | vanilla | 0.92 s | 4,225,452 | 10 / 0 | 2 of 4 | 187,831 |
| 11 | `HDAADVVAHHHVADVADDADHVVAHVVDHDHDAVHA` | vanilla | 1.02 s | 4,579,268 | 12 / 0 | 2 of 4 | 36,901 |
| 12 | `VHDHHAAHAAVADVVDVDHAHVDAVVHHAVDADADH` | vanilla | 5.86 s | 24,623,921 | 7 / 0 | 2 of 4 | 39,170 |
| 13 | `VVADVDDHDAVAVHAAHHVDAVHDHAVAHAADHDVV` | vanilla | 1.00 s | 4,419,615 | 8 / 0 | 1 of 4 | 204,570 |
| 14 | `VVDVVAAHADHDDHVVHADVHDVDADAAVAVHDAHH` | vanilla | 0.18 s | 917,708 | 12 / 0 | 1 of 4 | 83,118 |
| 15 | `HHADHVAVAADADVDHVDAHVADHDHDHVVAVVHDA` | vanilla | 1.22 s | 5,547,617 | 10 / 0 | 1 of 4 | 72,198 |
| 16 | `VDAHHAHAVAVAADHDVDVVAADHDHDVVHVHAHDA` | vanilla | 1.51 s | 6,903,847 | 8 / 0 | 0 of 4 | 133,172 |
| 17 | `DVDAHVAVADHDAHHAVVHDAADHVAHVVHADVHDA` | vanilla | 2.41 s | 10,348,202 | 5 / 0 | 0 of 4 | 48,353 |
| 18 | `DDADVHVHHADAVDAVHDADHAHVHVVDHDHDAAVV` | vanilla | 1.11 s | 5,110,298 | 10 / 1 | 1 of 4 | 309,079 |
| 19 | `ADVADHHHVVVHADDHDAHDAVVAVAHDHDADVVHA` | vanilla | 0.95 s | 4,161,622 | 12 / 0 | 2 of 4 | 214,913 |
| 20 | `ADHDADVVHHVVHDAHAHDVHHHAADAAVAVHDDVD` | vanilla | 5.49 s | 20,296,747 | 10 / 0 | 1 of 4 | 331,419 |
| 21 | `AHVADVDHDHHVAVVADDDHVVHDADAAHAHVDDVV` | vanilla | 0.26 s | 1,219,287 | 9 / 0 | 3 of 4 | 28,007 |
| 22 | `ADHHHAHVVAVAHDADVDHDAHAHVAHVVHADVDAD` | vanilla | 0.36 s | 1,737,489 | 6 / 0 | 0 of 4 | 376,582 |
| 23 | `HDAADHVAHHVVADVHDAHHAHAHAVAVVHDVDDAD` | vanilla | 1.00 s | 4,148,954 | 6 / 0 | 1 of 4 | 254,626 |

Summary: the first player (vanilla) wins on 23 of 23 boards. 215 of 828 first moves win (26%), and 29 of 92 center-square openings win (32%).
Root solves took 0.18 to 5.86 s.

## First-move maps

W = forced win for vanilla, = = draw, . = forced loss. Rows top to bottom, as in the app.

**Board 1** `ADHHAHVVHVVHHDADADDDADHVVHHADAVDAHVD`

```
. . W W . .
. . . . . .
W W . W . W
W W W . . .
= . . . . .
. W . . . .
```

**Board 2** `ADHHHAHVVAVAHDADVDDHVDADADAHVVHVDHAH`

```
. . . . W W
. . W . . W
. . . W . W
. . . . . W
. . W W . .
. . . . W .
```

**Board 3** `VVDVVAAHADHDDHVVHADVHDDAADAVHHVHDVDA`

```
. . . . . .
W . W . . W
W . W . . .
. . . W . .
. . . W . .
. W . . . .
```

**Board 4** `ADHDHVVVHADAHDAHVDAHVADVDHDHHVAVVADD`

```
. . . . . .
. . . . . W
. = . . W .
. . = . . W
W . W . . W
. . . . . W
```

**Board 5** `ADVAHVHHVDHDADDAVVADHDVHVVHADAHDAVHD`

```
. . . . W .
. . W W . .
W W . W . .
. W W . W .
. . . . . W
. W . . . .
```

**Board 6** `ADHHAHVVHVVHHDADADDDADVHVHHADAVDAVHD`

```
. . . W . .
. . W . . .
. . . . . W
W W W W . .
. . . . W W
. W . . . W
```

**Board 7** `VDAADHHAVHVVADHHDAHHAHAHAVAVVHDVDDAD`

```
W . . . W .
. . . . . .
. W . . W .
. W W . W .
. . W . . .
. . . . W .
```

**Board 8** `VDAADVHAVHHVADHADDADHVVAHVVDHDHDAVHA`

```
W . . W W .
. . W W W .
. . W W . W
. W . . . W
. . . W W .
. W W . . .
```

**Board 9** `ADHDHVHVVADAHDAHVDAHVADVDHDHHVAVVADD`

```
. . . . . .
. . . . . W
. W . . W .
. . . . W W
W . W . . W
W . . . . .
```

**Board 10** `DADDVDHVVAVAHAHAHHADHDVHVVHADAHDAVHD`

```
. . W . . .
. . . . . .
. W . W . .
. W . W . .
W . . . W W
W W . . . .
```

**Board 11** `HDAADVVAHHHVADVADDADHVVAHVVDHDHDAVHA`

```
. . . . W W
W . W W W .
. . W W W .
. W . . . .
. . . W . .
. W . . . .
```

**Board 12** `VHDHHAAHAAVADVVDVDHAHVDAVVHHAVDADADH`

```
. . . . . .
W . W . . .
. . . . . .
. . W W W .
. . W W . .
. . . . . .
```

**Board 13** `VVADVDDHDAVAVHAAHHVDAVHDHAVAHAADHDVV`

```
. . W . . .
. W . W . .
. . . W W .
W . . . . .
. . . . . W
. W . . . .
```

**Board 14** `VVDVVAAHADHDDHVVHADVHDVDADAAVAVHDAHH`

```
W . W . . W
W . W . . W
. . . . W .
. . . W W .
. . . . W .
. . . W W .
```

**Board 15** `HHADHVAVAADADVDHVDAHVADHDHDHVVAVVHDA`

```
. . W . . W
W . . . . .
. W . . . .
. . . W W W
W . . . . .
. . . W W .
```

**Board 16** `VDAHHAHAVAVAADHDVDVVAADHDHDVVHVHAHDA`

```
. . . . . .
W . . . . .
. . . . W W
. W . . . .
W . W . . .
. W . W . .
```

**Board 17** `DVDAHVAVADHDAHHAVVHDAADHVAHVVHADVHDA`

```
. . . . . .
W . . W . .
. W . . . .
. . . . . .
. W . . . .
. W . . . .
```

**Board 18** `DDADVHVHHADAVDAVHDADHAHVHVVDHDHDAAVV`

```
W . . . . .
. . W . . .
. . = W W .
. . . . W W
. . . W W .
. W . W . .
```

**Board 19** `ADVADHHHVVVHADDHDAHDAVVAVAHDHDADVVHA`

```
. . . . W .
. W W W . .
. . W . . .
. . W . . W
. W W W . .
W W . . . .
```

**Board 20** `ADHDADVVHHVVHDAHAHDVHHHAADAAVAVHDDVD`

```
. . . . . .
. . . W . .
. W W . W .
. W . . . .
. . . W W W
W W . . . .
```

**Board 21** `AHVADVDHDHHVAVVADDDHVVHDADAAHAHVDDVV`

```
. . . . W .
. . . . . .
W . W W . .
. . W . W .
. . W . . W
W . . . . .
```

**Board 22** `ADHHHAHVVAVAHDADVDHDAHAHVAHVVHADVDAD`

```
. . W . . .
. . . . . .
W . . . . .
. . . . W .
. W W . . .
. . . . W .
```

**Board 23** `HDAADHVAHHVVADVHDAHHAHAHAVAVVHDVDDAD`

```
W . . . W .
. . . . . .
. . . . W .
. W W . . .
. . . . . .
. . . . W .
```

