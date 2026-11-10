import { doc, getDoc } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

export type OverviewNoticeId = "longCalls" | "googleChat" | "otherHelp";
const noticeIds:OverviewNoticeId[]=["longCalls","googleChat","otherHelp"];

export async function loadOverviewNoticeAccess():Promise<OverviewNoticeId[]>{
  const {auth,db}=requireFirebase();const user=auth.currentUser;if(!user)return [];
  const [userSnap,permissionSnap]=await Promise.all([getDoc(doc(db,"users",user.uid)),getDoc(doc(db,"featurePermissions","overviewNotices"))]);
  if(!userSnap.exists()||userSnap.data().status!=="approved")return [];
  const profile=userSnap.data();if(profile.role==="admin"||profile.isSupervisor===true)return noticeIds;
  if(!permissionSnap.exists())return [];
  const notices=permissionSnap.data().notices??{};
  return noticeIds.filter(id=>{
    const p=notices[id];if(!p||p.enabled!==true)return false;
    return (Array.isArray(p.wholeSectorIds)&&p.wholeSectorIds.includes(profile.sectorId))
      ||(Array.isArray(p.contactIds)&&p.contactIds.includes(profile.contactId))
      ||(Array.isArray(p.agentIds)&&p.agentIds.includes(user.uid));
  });
}
