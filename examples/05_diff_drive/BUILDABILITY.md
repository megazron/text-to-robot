# Physical build evidence — 05_diff_drive

**Not manufacturing-ready. No tested physical prototype is documented.**

[CAD export](robot.cad.zip) · [BOM](BOM.md) · [Simulation results](simulation_report.json) · [Source-hashed inventory](buildability_report.json)

The CAD contains conceptual link solids. It is not a set of verified motor mounts, bearing seats, electronics housings and assembly drawings. The optional enclosure generator uses synthetic dimensions until measured hardware is supplied.

Declared model mass: 3.862 kg. 13 links have inferred mass. 2 joints require actuator integration.

Catalogue effort sizing: passes its estimate. This does not establish speed, duty cycle, fit or electrical compatibility.

## Missing evidence

- No verified vendor drawing, shaft/horn interface, mounting-hole pattern or bearing fit is associated with each joint.
- No complete speed/effort/thermal-duty and feedback qualification; catalogue effort alone does not validate the selected actuator.
- No verified placement, mounting, connector access or cable-bend clearance for the selected electronics. The optional enclosure example uses synthetic dimensions.
- No validated rail voltages, peak currents, power budget, wiring schematic or protection sizing.
- No complete tolerance stack, material/process specification, fastener schedule, assembly procedure or service-access validation.
- No prototype measurements establish masses, inertias, friction, backlash, compliance or model-to-hardware agreement.
- No physical assembly, load test or task-performance evidence is attached.
