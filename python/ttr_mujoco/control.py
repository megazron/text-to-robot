"""Optional model-based bias-force feedforward for fixed-base position servos.
Compensation goes through the motor and its existing effort clamp; no external
forces, body gravcomp flags or extra actuators are introduced.
"""
import mujoco
import numpy as np

class ModelBiasController:
    def __init__(self,m):
        if any(t==mujoco.mjtJoint.mjJNT_FREE for t in m.jnt_type):
            raise ValueError('Bias controller currently requires a fixed base')
        self.m=m;self.axes=[]
        for a in range(m.nu):
            kp=float(m.actuator_gainprm[a,0]);j=int(m.actuator_trnid[a,0])
            if not (kp>0 and m.actuator_biasprm[a,1]==-kp and m.actuator_biasprm[a,2]==0):
                raise ValueError('Bias controller requires simple position actuators')
            if (m.actuator_trntype[a]!=mujoco.mjtTrn.mjTRN_JOINT or m.actuator_gear[a,0]!=1
                or not m.actuator_forcelimited[a] or not m.actuator_ctrllimited[a]):
                raise ValueError('Bias controller requires unit joint gears and explicit target/effort limits')
            lo,hi=m.actuator_ctrlrange[a];self.axes.append((a,j,kp,float(lo),float(hi)))
        # Desired positions remain bounded below. Servo offsets may lie outside
        # that range to cancel load at a joint limit, but torque stays clamped.
        m.actuator_ctrllimited[:]=False

    def apply(self,d,targets):
        targets=np.asarray(targets,dtype=float)
        if targets.shape!=(self.m.nu,) or not np.isfinite(targets).all():
            raise ValueError('Expected one finite target per position actuator')
        mujoco.mj_forward(self.m,d)
        for a,j,kp,lo,hi in self.axes:
            target=float(np.clip(targets[a],lo,hi))
            d.ctrl[a]=target+float(d.qfrc_bias[self.m.jnt_dofadr[j]])/kp
