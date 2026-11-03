# Printability

Every printed part of every designed example, audited by `scripts/print_audit.py` (`python -m ttr_build.dfm`): best orientation on a 250 x 210 x 220 mm bed, flat face down, support area (faces steeper than 45 deg), wall thickness (< 0.8 mm fails, 0.8-1.2 mm is a thin-wall warning), one connected watertight solid. Supports up to 8 % of the surface print without supports; up to 30 % (inside open shells) with removable supports.

| Example | Printable | With supports | Thin-wall warnings | Failing |
|---|--:|--:|--:|---|
| 01_arm_2dof | 3/4 | 0 | 0 | forearm: walls down to 0.20 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface |
| 02_arm_6dof | 8/8 | 0 | 0 | - |
| 03_arm_7dof | 9/9 | 0 | 0 | - |
| 05_diff_drive | 15/15 | 0 | 0 | - |
| 06_four_wheel | 19/19 | 0 | 0 | - |
| 07_mecanum | 15/15 | 0 | 0 | - |
| 12_mars_rover | 20/20 | 0 | 3 | - |
| 15_wall_e | 29/29 | 2 | 2 | - |
| 16_eva | 35/36 | 3 | 4 | skirt_left_front: walls down to 0.53 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface |
| 17_baymax | 28/29 | 5 | 5 | head_dome: needs supports under 232.6 cm^2 (30% of its surface) even in its best orientation |
