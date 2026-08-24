(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PCBTraceCalculator = api;
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const COPPER_RESISTIVITY_20C = 1.724e-8;
  const COPPER_TEMP_COEFFICIENT = 0.00393;

  const defaults = Object.freeze({
    sourceVoltage: 5,
    stripCount: 4,
    loadCount: 10,
    loadCurrentMa: 60,
    pitchMm: 6,
    topOffsetMm: 0,
    traceWidthMm: 2,
    copperThicknessUm: 35,
    parallelLayers: 1,
    copperTemperatureC: 60,
    commonFeedResistanceMohm: 5,
    minimumVoltage: 4.5
  });

  function requireFinite(name, value, minimum, allowMinimum) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be a number.`);
    }
    if (allowMinimum ? value < minimum : value <= minimum) {
      const comparison = allowMinimum ? "at least" : "greater than";
      throw new Error(`${name} must be ${comparison} ${minimum}.`);
    }
  }

  function validate(input) {
    requireFinite("Source voltage", input.sourceVoltage, 0, false);
    requireFinite("Number of strips", input.stripCount, 1, true);
    requireFinite("Loads per strip", input.loadCount, 1, true);
    requireFinite("Current per load", input.loadCurrentMa, 0, true);
    requireFinite("LED pitch", input.pitchMm, 0, true);
    requireFinite("Top offset", input.topOffsetMm, 0, true);
    requireFinite("Trace width", input.traceWidthMm, 0, false);
    requireFinite("Copper thickness", input.copperThicknessUm, 0, false);
    requireFinite("Parallel copper layers", input.parallelLayers, 1, true);
    requireFinite("Copper temperature", input.copperTemperatureC, -273.15, false);
    requireFinite("Common-feed resistance", input.commonFeedResistanceMohm, 0, true);
    requireFinite("Minimum voltage", input.minimumVoltage, 0, true);

    for (const field of ["stripCount", "loadCount", "parallelLayers"]) {
      if (!Number.isInteger(input[field])) {
        throw new Error(`${field} must be a whole number.`);
      }
    }
    if (input.copperTemperatureC > 200) {
      throw new Error("Copper temperature must not exceed 200 °C.");
    }
  }

  function calculate(rawInput) {
    const input = { ...defaults, ...rawInput };
    validate(input);

    const currentPerLoad = input.loadCurrentMa / 1000;
    const pitch = input.pitchMm / 1000;
    const pcbLengthMm = input.loadCount * input.pitchMm;
    const topOffset = input.topOffsetMm / 1000;
    const copperArea =
      (input.traceWidthMm / 1000) *
      (input.copperThicknessUm / 1e6) *
      input.parallelLayers;
    const resistivity =
      COPPER_RESISTIVITY_20C *
      (1 + COPPER_TEMP_COEFFICIENT * (input.copperTemperatureC - 20));
    const resistancePerPitch = resistivity * pitch / copperArea;
    const resistanceToFirstLoad = resistivity * topOffset / copperArea;
    const stripCurrent = input.loadCount * currentPerLoad;
    const panelCurrent = input.stripCount * stripCurrent;
    const commonFeedResistance = input.commonFeedResistanceMohm / 1000;
    const commonFeedDrop = panelCurrent * commonFeedResistance;
    const topVoltage = input.sourceVoltage - commonFeedDrop;

    const profile = [];
    let voltage = topVoltage - 2 * stripCurrent * resistanceToFirstLoad;
    for (let index = 0; index < input.loadCount; index += 1) {
      const downstreamLoads = input.loadCount - index - 1;
      profile.push({
        index: index + 1,
        distanceMm: input.topOffsetMm + index * input.pitchMm,
        voltage,
        currentAfterLoad: downstreamLoads * currentPerLoad
      });
      voltage -= 2 * downstreamLoads * currentPerLoad * resistancePerPitch;
    }

    const lowerVoltage = profile[profile.length - 1].voltage;
    const pcbRailDrop = topVoltage - lowerVoltage;
    const totalDrop = input.sourceVoltage - lowerVoltage;
    const squareSum =
      (input.loadCount - 1) * input.loadCount * (2 * input.loadCount - 1) / 6;
    const stripCopperLoss =
      2 * stripCurrent ** 2 * resistanceToFirstLoad +
      2 * currentPerLoad ** 2 * resistancePerPitch * squareSum;
    const totalCopperLoss = stripCopperLoss * input.stripCount;
    const commonFeedLoss = panelCurrent ** 2 * commonFeedResistance;
    const currentDensity = stripCurrent / copperArea;

    return {
      input,
      profile,
      pcbLengthMm,
      resistivity,
      copperArea,
      resistancePerPitch,
      resistanceToFirstLoad,
      stripCurrent,
      panelCurrent,
      commonFeedDrop,
      topVoltage,
      lowerVoltage,
      pcbRailDrop,
      totalDrop,
      totalCopperLoss,
      commonFeedLoss,
      currentDensity,
      meetsMinimumVoltage: lowerVoltage >= input.minimumVoltage
    };
  }

  return { defaults, calculate };
});

if (typeof document !== "undefined") {
  "use strict";

  const api = window.PCBTraceCalculator;
  const form = document.getElementById("calculator-form");
  const errorMessage = document.getElementById("error-message");
  const results = document.getElementById("results");
  const inputIds = Object.keys(api.defaults);
  const copperWeight = document.getElementById("copperWeight");
  const copperThickness = document.getElementById("copperThicknessUm");
  const copperEquivalent = document.getElementById("copperEquivalent");
  const storageMessage = document.getElementById("storage-message");
  const dimensionMode = document.getElementById("dimensionMode");
  const pcbLength = document.getElementById("pcbLength");
  const loadCount = document.getElementById("loadCount");
  const pitch = document.getElementById("pitchMm");
  const dimensionNote = document.getElementById("dimensionNote");
  const performanceFlag = document.getElementById("performanceFlag");
  const performanceStatus = document.getElementById("performanceStatus");
  const performanceSummary = document.getElementById("performanceSummary");
  const storageKey = "pcb-trace-calculator-inputs-v1";
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));

  const format = {
    volts: value => `${value.toFixed(3)} V`,
    amps: value => value < 1 ? `${(value * 1000).toFixed(1)} mA` : `${value.toFixed(3)} A`,
    watts: value => value < 1 ? `${(value * 1000).toFixed(1)} mW` : `${value.toFixed(3)} W`,
    resistance: value => value < 0.001
      ? `${(value * 1e6).toFixed(2)} µΩ`
      : `${(value * 1000).toFixed(3)} mΩ`
  };

  function readInputs() {
    return Object.fromEntries(inputIds.map(id => [id, Number(document.getElementById(id).value)]));
  }

  function showStorageError(error) {
    storageMessage.textContent = `Input values could not be saved or restored: ${error.message}`;
    storageMessage.hidden = false;
  }

  function saveInputs() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        ...Object.fromEntries(inputIds.map(id => [id, document.getElementById(id).value])),
        copperWeight: copperWeight.value,
        dimensionMode: dimensionMode.value,
        pcbLength: pcbLength.value
      }));
      storageMessage.hidden = true;
    } catch (error) {
      showStorageError(error);
    }
  }

  function restoreInputs() {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) {
        return;
      }

      const values = JSON.parse(stored);
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        throw new Error("saved input data is invalid.");
      }
      for (const id of inputIds) {
        if (typeof values[id] === "string") {
          document.getElementById(id).value = values[id];
        }
      }
      if (typeof values.copperWeight === "string") {
        copperWeight.value = values.copperWeight;
      }
      if (["pcbLength", "loadCount"].includes(values.dimensionMode)) {
        dimensionMode.value = values.dimensionMode;
      }
      if (typeof values.pcbLength === "string") {
        pcbLength.value = values.pcbLength;
      }
    } catch (error) {
      showStorageError(error);
    }
  }

  function selectTab(selectedTab) {
    for (const tab of tabs) {
      const selected = tab === selectedTab;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
    }
  }

  function syncDimensions() {
    const calculateLoadCount = dimensionMode.value === "loadCount";
    loadCount.readOnly = calculateLoadCount;
    pcbLength.readOnly = !calculateLoadCount;
    loadCount.classList.toggle("calculated-field", calculateLoadCount);
    pcbLength.classList.toggle("calculated-field", !calculateLoadCount);

    const pitchMm = Number(pitch.value);
    if (calculateLoadCount) {
      const lengthMm = Number(pcbLength.value);
      if (!Number.isFinite(lengthMm) || !Number.isFinite(pitchMm) || pitchMm <= 0) {
        loadCount.value = "";
        dimensionNote.textContent = "Enter a PCB length and a pitch greater than zero.";
        return;
      }
      const calculatedCount = Math.floor(lengthMm / pitchMm);
      loadCount.value = calculatedCount;
      const remainingMm = lengthMm - calculatedCount * pitchMm;
      dimensionNote.textContent =
        `Calculated: ${calculatedCount} LED${calculatedCount === 1 ? "" : "s"}, ${remainingMm.toFixed(1)} mm remaining`;
      return;
    }

    const count = Number(loadCount.value);
    const lengthMm = count * pitchMm;
    pcbLength.value = Number.isFinite(lengthMm) ? lengthMm.toFixed(1) : "";
    dimensionNote.textContent = "Calculated: LED count × pitch";
  }

  function setText(id, text) {
    document.getElementById(id).textContent = text;
  }

  function syncCopperSelection() {
    const isCustom = copperWeight.value === "custom";
    copperThickness.readOnly = !isCustom;
    copperThickness.classList.toggle("calculated-field", !isCustom);
    if (!isCustom) {
      copperThickness.value = copperWeight.value;
    }
    const thicknessUm = Number(copperThickness.value);
    const thicknessMils = thicknessUm / 25.4;
    copperEquivalent.textContent = Number.isFinite(thicknessUm)
      ? `${isCustom ? "Custom" : "Selected"}: ${thicknessUm} µm / ${thicknessMils.toFixed(2)} mil`
      : "Enter the actual finished copper thickness.";
  }

  function createSvgElement(name, attributes, text) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, value);
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function renderChart(calculation) {
    const svg = document.getElementById("voltage-chart");
    svg.replaceChildren();

    const width = 800;
    const height = 260;
    const margin = { left: 64, right: 24, top: 18, bottom: 42 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const values = calculation.profile.map(point => point.voltage);
    const minValue = Math.min(...values, calculation.input.minimumVoltage);
    const maxValue = Math.max(...values, calculation.input.minimumVoltage);
    const padding = Math.max((maxValue - minValue) * 0.15, 0.05);
    const yMin = minValue - padding;
    const yMax = maxValue + padding;
    const maxDistance = Math.max(calculation.profile.at(-1).distanceMm, 1);
    const x = distance => margin.left + distance / maxDistance * chartWidth;
    const y = voltage => margin.top + (yMax - voltage) / (yMax - yMin) * chartHeight;

    for (let tick = 0; tick <= 4; tick += 1) {
      const value = yMin + (yMax - yMin) * tick / 4;
      const yPosition = y(value);
      svg.append(
        createSvgElement("line", {
          x1: margin.left,
          y1: yPosition,
          x2: width - margin.right,
          y2: yPosition,
          class: "chart-grid"
        }),
        createSvgElement("text", {
          x: margin.left - 10,
          y: yPosition + 4,
          "text-anchor": "end",
          class: "chart-axis-label"
        }, `${value.toFixed(2)} V`)
      );
    }

    const limitY = y(calculation.input.minimumVoltage);
    svg.append(
      createSvgElement("line", {
        x1: margin.left,
        y1: limitY,
        x2: width - margin.right,
        y2: limitY,
        class: "chart-limit"
      }),
      createSvgElement("text", {
        x: width - margin.right,
        y: limitY - 7,
        "text-anchor": "end",
        class: "chart-axis-label"
      }, "Minimum")
    );

    const points = calculation.profile
      .map(point => `${x(point.distanceMm)},${y(point.voltage)}`)
      .join(" ");
    svg.appendChild(createSvgElement("polyline", { points, class: "chart-line" }));

    const pointStep = Math.max(1, Math.ceil(calculation.profile.length / 50));
    calculation.profile.forEach((point, index) => {
      if (index % pointStep === 0 || index === calculation.profile.length - 1) {
        svg.appendChild(createSvgElement("circle", {
          cx: x(point.distanceMm),
          cy: y(point.voltage),
          r: 4,
          class: "chart-point"
        }));
      }
    });

    svg.appendChild(createSvgElement("text", {
      x: margin.left + chartWidth / 2,
      y: height - 8,
      "text-anchor": "middle",
      class: "chart-axis-label"
    }, `Distance from injection (mm), 0 to ${maxDistance.toFixed(1)}`));
  }

  function renderTable(calculation) {
    const tbody = document.getElementById("profile-table");
    const maximumRows = 200;
    const step = Math.max(1, Math.ceil(calculation.profile.length / maximumRows));
    const acceptable = calculation.profile.filter(
      point => point.voltage >= calculation.input.minimumVoltage
    );
    const minimumRow = acceptable.length > 0
      ? acceptable[acceptable.length - 1]
      : calculation.profile[0];
    const shown = calculation.profile.filter((point, index) =>
      index % step === 0 ||
      index === calculation.profile.length - 1 ||
      point.index === minimumRow.index
    );

    tbody.replaceChildren(...shown.map(point => {
      const row = document.createElement("tr");
      if (point.index === minimumRow.index) {
        row.className = "minimum-row";
        row.title = acceptable.length > 0
          ? "Last LED that meets the minimum acceptable voltage"
          : "No LED meets the minimum acceptable voltage";
      }
      for (const value of [
        point.index,
        `${point.distanceMm.toFixed(1)} mm`,
        format.volts(point.voltage),
        format.amps(point.currentAfterLoad)
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      }
      return row;
    }));

    const thresholdNote = acceptable.length > 0
      ? "Red row is the last LED meeting the minimum acceptable voltage."
      : "Red row is the first LED; no LED meets the minimum acceptable voltage.";
    setText(
      "table-note",
      step > 1
        ? `Showing sampled rows (${shown.length} of ${calculation.profile.length}). ${thresholdNote}`
        : thresholdNote
    );
  }

  function render() {
    try {
      const calculation = api.calculate(readInputs());
      errorMessage.hidden = true;
      results.hidden = false;

      performanceFlag.className =
        `performance-flag ${calculation.meetsMinimumVoltage ? "pass" : "fail"}`;
      performanceStatus.textContent = calculation.meetsMinimumVoltage ? "PASS" : "FAIL";
      performanceSummary.textContent =
        `${format.volts(calculation.lowerVoltage)} lowest / ${format.volts(calculation.input.minimumVoltage)} required`;

      setText("topVoltage", format.volts(calculation.topVoltage));
      setText("lowerVoltage", format.volts(calculation.lowerVoltage));
      setText("totalDrop", format.volts(calculation.totalDrop));
      setText("dropPercent", `${(calculation.totalDrop / calculation.input.sourceVoltage * 100).toFixed(2)}% of source`);
      setText("panelCurrent", format.amps(calculation.panelCurrent));
      setText("stripCurrent", `${format.amps(calculation.stripCurrent)} per strip`);
      setText("currentDensity", `${(calculation.currentDensity / 1e6).toFixed(2)} A/mm²`);
      setText("copperLoss", format.watts(calculation.totalCopperLoss));
      setText("feedLoss", `${format.watts(calculation.commonFeedLoss)} common-feed loss`);
      setText("detailSourceVoltage", format.volts(calculation.input.sourceVoltage));
      setText("commonFeedDrop", format.volts(calculation.commonFeedDrop));
      setText("railDrop", format.volts(calculation.pcbRailDrop));
      setText("segmentResistance", `${format.resistance(calculation.resistancePerPitch)} per polarity`);
      setText("copperArea", `${(calculation.copperArea * 1e6).toFixed(4)} mm²`);
      setText("maxStripCurrent", format.amps(calculation.stripCurrent));

      const voltageStatus = document.getElementById("voltageStatus");
      voltageStatus.textContent = calculation.meetsMinimumVoltage
        ? `PASS: ≥ ${calculation.input.minimumVoltage.toFixed(2)} V minimum`
        : `LOW: < ${calculation.input.minimumVoltage.toFixed(2)} V minimum`;
      voltageStatus.className = calculation.meetsMinimumVoltage ? "status-good" : "status-warning";

      renderChart(calculation);
      renderTable(calculation);
    } catch (error) {
      errorMessage.textContent = error.message;
      errorMessage.hidden = false;
      results.hidden = true;
      performanceFlag.className = "performance-flag fail";
      performanceStatus.textContent = "FAIL";
      performanceSummary.textContent = "Correct invalid parameters";
    }
  }

  form.addEventListener("input", event => {
    if (event.target === copperWeight || event.target === copperThickness) {
      syncCopperSelection();
    }
    if ([dimensionMode, pcbLength, loadCount, pitch].includes(event.target)) {
      syncDimensions();
    }
    render();
    saveInputs();
  });
  document.getElementById("reset-button").addEventListener("click", () => {
    for (const [id, value] of Object.entries(api.defaults)) {
      document.getElementById(id).value = value;
    }
    copperWeight.value = String(api.defaults.copperThicknessUm);
    dimensionMode.value = "pcbLength";
    syncCopperSelection();
    syncDimensions();
    render();
    saveInputs();
  });

  for (const tab of tabs) {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextTab = tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
      selectTab(nextTab);
      nextTab.focus();
    });
  }

  restoreInputs();
  syncCopperSelection();
  syncDimensions();
  render();
}
