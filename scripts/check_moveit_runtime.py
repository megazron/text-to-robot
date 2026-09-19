"""Check an already-running generated MoveIt mock launch. Requires sourced ROS 2."""
import argparse,hashlib,json,time
from pathlib import Path
import rclpy
from rclpy.action import ActionClient
from controller_manager_msgs.srv import ListControllers
from moveit_msgs.srv import GetMotionPlan,GetPlanningScene,GetStateValidity
from moveit_msgs.msg import Constraints,JointConstraint,PlanningSceneComponents
from moveit_msgs.action import ExecuteTrajectory

p=argparse.ArgumentParser(description=__doc__);p.add_argument('--group',default='arm');p.add_argument('--joints',nargs='+',default=[f'joint_{i}' for i in range(1,7)])
p.add_argument('--robot',type=Path);p.add_argument('--execute',action='store_true');p.add_argument('--json',type=Path,required=True);a=p.parse_args()
rclpy.init();node=rclpy.create_node('ttr_export_validation')
def call(typ,name,request):
    client=node.create_client(typ,name)
    if not client.wait_for_service(timeout_sec=30):raise RuntimeError(name+' unavailable')
    future=client.call_async(request);rclpy.spin_until_future_complete(node,future,timeout_sec=30)
    if not future.done():raise RuntimeError(name+' timed out')
    return future.result()
try:
    deadline=time.monotonic()+30
    while True:
        controllers=call(ListControllers,'/controller_manager/list_controllers',ListControllers.Request())
        states={c.name:c.state for c in controllers.controller}
        active=all(states.get(k)=='active' for k in ('joint_state_broadcaster','joint_trajectory_controller'))
        if active or time.monotonic()>deadline:break
        rclpy.spin_once(node,timeout_sec=.2)
    scene_request=GetPlanningScene.Request();scene_request.components.components=PlanningSceneComponents.ROBOT_STATE
    scene=call(GetPlanningScene,'/get_planning_scene',scene_request)
    validity_request=GetStateValidity.Request();validity_request.robot_state=scene.scene.robot_state
    validity=call(GetStateValidity,'/check_state_validity',validity_request)
    request=GetMotionPlan.Request();q=request.motion_plan_request;q.group_name=a.group;q.allowed_planning_time=5.;q.num_planning_attempts=1
    q.max_velocity_scaling_factor=.2;q.max_acceleration_scaling_factor=.2;q.start_state.is_diff=True
    goal=Constraints()
    for i,name in enumerate(a.joints):
        j=JointConstraint();j.joint_name=name;j.position=.15 if i==0 else 0.;j.tolerance_above=.01;j.tolerance_below=.01;j.weight=1.;goal.joint_constraints.append(j)
    q.goal_constraints=[goal];response=call(GetMotionPlan,'/plan_kinematic_path',request).motion_plan_response
    report={'scope':'ROS 2 mock hardware wiring and planning; not dynamics or real robot execution',
        'controllers':states,'controllers_active':active,'planning_scene_available':True,'group':a.group,
        'planning_error_code':response.error_code.val,'planning_pass':response.error_code.val==1,
        'trajectory_points':len(response.trajectory.joint_trajectory.points),'execution_requested':a.execute,
        'goal_positions':{j.joint_name:j.position for j in goal.joint_constraints},
        'allowed_planning_time_s':q.allowed_planning_time,'planning_time_s':response.planning_time}
    report['start_state_valid']=validity.valid
    report['start_state_contacts']=[{'bodies':[c.contact_body_1,c.contact_body_2],'depth_m':c.depth} for c in validity.contacts]
    report['start_state_contact_count']=len(validity.contacts)
    report['contact_scope']='Contacts returned by GetStateValidity; service contact limits may truncate the list'
    if a.robot:report['robot_sha256']=hashlib.sha256(a.robot.read_bytes()).hexdigest()
    if a.execute and report['planning_pass']:
        action=ActionClient(node,ExecuteTrajectory,'/execute_trajectory');assert action.wait_for_server(timeout_sec=30)
        g=ExecuteTrajectory.Goal();g.trajectory=response.trajectory
        future=action.send_goal_async(g);rclpy.spin_until_future_complete(node,future,timeout_sec=30);handle=future.result();assert handle.accepted
        result=handle.get_result_async();rclpy.spin_until_future_complete(node,result,timeout_sec=30)
        report['execution_error_code']=result.result().result.error_code.val
        report['execution_pass']=report['execution_error_code']==1
    report['pass']=active and report['start_state_valid'] and report['planning_pass'] and (not a.execute or report.get('execution_pass',False))
    a.json.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
finally:
    node.destroy_node();rclpy.shutdown()
raise SystemExit(0 if report['pass'] else 1)
