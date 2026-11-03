# Mark 43 rebuild: a suit a person can actually wear

The current example 14 is an exoskeleton (capsule limbs, box torso) under panels: it neither looks like the
Age of Ultron Mark 43 nor fits a person. Rebuild it as wearable printed armour, body first.

1. Body: parametric wearer (default 1.75 m) from anthropometric ratios (segment lengths, circumferences, joint centres).
2. Shells: sculpted offset surfaces around each segment, 12-20 mm padding gap, 2.4-3 mm walls; Mark 43 features:
   chest with pec contours and arc-reactor ring, segmented abdomen, layered shoulder bells, biceps/forearm/gauntlet with
   palm repulsor, hip/cod, thighs, knee caps, shins, boots; helmet with hinged faceplate, eye slits, jaw line;
   red/gold split as in the film. No logos.
3. Wearability: every shell split into printable sections (MK4 bed), opening along the sides with webbing straps and
   buckles / magnets; shells end short of joints; posed checks (sit, squat, elbow 120 deg, arms raised) with no
   shell-shell or shell-body interference.
4. Electronics (realistic only): MG90S servo for the faceplate, LEDs for eyes / arc reactor / palms, 2S Li-ion + buck in
   the back plate. No claim of a powered exoskeleton.
5. Verification: scripts/print_audit.py on every shell, exact-mesh interference in the posed checks, renders next to
   the reference image, README.
