# PCB Trace Calculator Development Plan

## 1. Objective

Build a Python application that calculates PCB trace requirements from electrical, thermal, and manufacturing constraints. The first release will calculate required trace width or supported current and clearly report all assumptions, units, warnings, and intermediate values.

## 2. Scope

### Minimum viable product

- Calculate trace width from current and allowable temperature rise.
- Calculate supported current from trace width.
- Support external and internal copper layers.
- Support common copper weights and custom thickness values.
- Accept metric and imperial units.
- Report current density, cross-sectional area, resistance, voltage drop, and power loss.
- Provide a command-line interface.
- Validate inputs and warn when values are outside the selected model's supported range.
- Include automated unit, regression, and boundary tests.

### Later releases

- Graphical or web interface.
- Batch calculations from CSV files.
- Trace length and ambient-temperature derating.
- Parallel traces, vias, planes, and multilayer current sharing.
- IPC-2152 correction factors based on board construction.
- Saved projects and exportable calculation reports.

### Out of scope for the first release

- High-frequency impedance calculations.
- Creepage and clearance calculations.
- Thermal simulation or finite-element analysis.
- Certification of a physical PCB design.

## 3. Calculation Model

### Initial model

Use the IPC-2221 empirical relationship as the baseline:

```text
I = k × ΔT^0.44 × A^0.725
```

Where:

- `I` is current in amperes.
- `ΔT` is conductor temperature rise in degrees Celsius.
- `A` is trace cross-sectional area in square mils.
- `k` is `0.048` for external traces and `0.024` for internal traces.

Derive:

```text
A = (I / (k × ΔT^0.44))^(1 / 0.725)
width = A / copper_thickness
```

Resistance and losses:

```text
R = ρ × length / cross_sectional_area
V_drop = I × R
P_loss = I² × R
```

Use temperature-adjusted copper resistivity when ambient or operating temperature is supplied.

### Model limitations

- Label IPC-2221 results as estimates, not guaranteed design limits.
- Document the model's assumptions and applicable range.
- Do not silently extrapolate invalid inputs.
- Design the calculation layer around a model interface so IPC-2152 or another verified model can be added without changing the user interfaces.
- Verify formula constants, unit conventions, and usage rights against authoritative standards before release.

## 4. Functional Requirements

1. Users can select calculation mode: `width-from-current` or `current-from-width`.
2. Users must supply layer type, copper thickness, and allowable temperature rise.
3. Trace length is optional unless voltage drop, resistance, or power loss is requested.
4. Every result identifies the calculation model and normalized input values.
5. Results include practical rounded dimensions without replacing the raw calculated value.
6. Invalid, zero, negative, non-finite, or physically impossible inputs produce explicit errors.
7. Unusually high temperature rise, current density, or voltage drop produces a warning.
8. Unit conversions are consistent and independently tested.

## 5. Proposed Architecture

```text
pcb_trace_calculator/
├── __init__.py
├── models.py          # Typed inputs, outputs, enums, and warnings
├── calculators.py     # Width, current, resistance, and loss calculations
├── standards.py       # IPC-2221 model and future model implementations
├── units.py           # Unit conversion and normalization
├── validation.py      # Input and supported-range validation
└── cli.py             # Command-line interface
tests/
├── test_calculators.py
├── test_standards.py
├── test_units.py
├── test_validation.py
└── test_cli.py
pyproject.toml
README.md
```

Implementation principles:

- Keep the core calculation package independent of the CLI or future GUI.
- Use typed dataclasses or equivalent immutable value objects.
- Normalize all internal dimensions to SI units, converting only at model and presentation boundaries.
- Keep rounding out of intermediate calculations.
- Return structured warnings with results instead of embedding warning text in formula code.

## 6. Development Phases

### Phase 1: Requirements and references

- Confirm target calculation standard and supported parameter ranges.
- Record authoritative reference examples for regression testing.
- Define supported input/output units and rounding rules.
- Define warning thresholds and safety disclaimer language.

**Exit criteria:** Formula definitions, reference cases, units, limits, and acceptance tolerances are documented.

### Phase 2: Project foundation

- Create the Python package and `pyproject.toml`.
- Configure formatting, linting, type checking, and testing.
- Define typed input/output models and calculation errors.
- Implement centralized unit conversions.

**Exit criteria:** Package imports successfully and unit-conversion tests pass.

### Phase 3: Core calculations

- Implement the IPC-2221 model.
- Implement width-from-current and current-from-width calculations.
- Implement resistance, voltage-drop, and power-loss calculations.
- Add temperature-adjusted copper resistivity.
- Preserve raw values and add presentation-specific rounding.

**Exit criteria:** Core calculations match verified reference cases within documented tolerances.

### Phase 4: Validation and safety

- Reject missing, negative, zero, infinite, and NaN values as appropriate.
- Enforce valid layer types, units, and copper thickness.
- Add warnings for unsupported extrapolation and impractical results.
- Ensure errors name the invalid field and expected range.

**Exit criteria:** Boundary and invalid-input tests pass with clear errors or warnings.

### Phase 5: Command-line interface

- Add commands for both calculation modes.
- Support explicit unit flags and readable terminal output.
- Add optional JSON output for automation.
- Return nonzero exit codes for invalid requests.

Example interface:

```bash
pcb-trace width --current 3A --temp-rise 10C --copper 1oz --layer external
pcb-trace current --width 1.5mm --temp-rise 20C --copper 35um --layer internal
```

**Exit criteria:** CLI integration tests cover successful calculations, JSON output, help text, and errors.

### Phase 6: Documentation and release

- Write installation and usage instructions.
- Explain formulas, assumptions, limitations, and safety margins.
- Include worked examples for internal and external traces.
- Document the public Python API.
- Run the complete quality suite and package a versioned release.

**Exit criteria:** A new user can install the package and reproduce all documented examples.

## 7. Test Strategy

- **Unit tests:** Formulas, inverses, conversions, rounding, resistivity, and validation.
- **Reference tests:** Compare results with authoritative published examples.
- **Property tests:** Confirm increasing width increases supported current, increasing current increases required width, and inverse calculations round-trip within tolerance.
- **Boundary tests:** Very small and large dimensions, low temperature rise, and supported-range limits.
- **CLI tests:** Argument parsing, output units, JSON schema, warnings, and exit codes.
- **Regression tests:** Add a fixed test for every corrected calculation defect.

Use strict tolerances for unit conversions and documented engineering tolerances for empirical-model comparisons.

## 8. Acceptance Criteria

- Both primary calculation modes produce repeatable, dimensionally correct results.
- Unit selection does not change the underlying physical result.
- At least one verified case exists for each layer type and calculation mode.
- Resistance, voltage drop, and power loss are internally consistent.
- Invalid inputs never produce success-shaped results.
- Every output states the model, layer type, copper thickness, and temperature rise.
- The package passes tests, linting, formatting checks, and static type checking.
- Documentation clearly states that results require engineering review and do not replace thermal validation of the finished PCB.

## 9. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Empirical equations are treated as exact limits | Display model name, assumptions, warnings, and design-review disclaimer |
| Incorrect mil, ounce, or micrometre conversion | Centralize conversions and test against independent known values |
| IPC-2221 is inadequate for a specific stack-up | Keep standards pluggable and plan an IPC-2152 implementation |
| Rounding produces an undersized trace | Round recommended widths upward to a configurable manufacturing increment |
| Inputs exceed the model's validated range | Reject or prominently warn instead of silently extrapolating |
| Reference data cannot be redistributed | Store only derived test cases that are legally usable and cite their source |

## 10. Suggested Milestones

1. **M1 - Calculation specification:** Requirements and verified reference cases complete.
2. **M2 - Core library:** Units, models, formulas, and validation complete.
3. **M3 - Usable MVP:** CLI and structured output complete.
4. **M4 - Release candidate:** Tests, documentation, and packaging complete.
5. **M5 - Enhanced model:** IPC-2152 support and comparison reporting complete.

