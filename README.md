# LED PCB Voltage Drop Calculator

A dependency-free HTML/JavaScript calculator for identical LED strips powered
from one end. Open `index.html` in a modern browser; no installation or server
is required.

The Input parameters tab saves changes in browser storage and restores the
last-used values the next time the calculator is opened. The Calculation behind
tab contains the live results, voltage profile, calculation details and table.
The dimension mode can calculate PCB length from LED count and pitch, or
calculate the whole number of LEDs that fit from PCB length and pitch. When
calculating LED count, any unused PCB length is displayed beside the result.

A live performance flag reports PASS when the calculated lowest LED voltage
meets the entered minimum acceptable voltage, and FAIL otherwise.

The Formulas & legend tab documents the symbols, units, conversions and
equations used to derive every displayed result.

## Required inputs

- Source voltage.
- Number of identical parallel strips.
- Number of LED load points per strip.
- Average current drawn by each LED or load point.
- Distance between load points.
- Effective positive and return rail width.
- Copper weight (0.5, 1, 2 or 3 oz), its corresponding displayed thickness,
  or a custom editable finished copper thickness.
- Number of parallel copper layers.
- Estimated copper operating temperature.

The optional injection-to-first-LED distance models copper before the first
load. Combined common-feed resistance models the power cable, connector and
shared positive/return path before the strips divide.

## Model

Each strip is divided into pitch-length segments. The current in each segment
is the sum of all downstream loads, so current decreases toward the lower end.
Positive and return rails are assumed to have equal geometry:

```text
Rsegment = ρ(T) × pitch / copper_area
Vnext = Vcurrent - 2 × Isegment × Rsegment
```

Copper resistivity is adjusted from its value at 20 °C using a temperature
coefficient of `0.00393 / °C`.

Use average load current to estimate steady voltage drop and copper loss.
Multiplexed LED designs must also be checked using peak scan current for driver,
via, connector and local conductor limits. This calculator is not a substitute
for IPC-2152 thermal analysis or physical measurements.
