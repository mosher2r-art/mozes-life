"use client";
import{useState}from"react";
import{authClient}from"@/lib/auth-client";
import{passwordProblem,PASSWORD_MIN,PASSWORD_MAX}from"@/lib/password-policy";
export function PasswordForm(){
  const[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[failed,setFailed]=useState(false),[visible,setVisible]=useState(false);
  return <form className="form block" onSubmit={async event=>{event.preventDefault();const form=event.currentTarget,data=new FormData(form),currentPassword=String(data.get("currentPassword")??""),newPassword=String(data.get("newPassword")??""),confirmation=String(data.get("confirmation")??"");setMessage("");setFailed(true);const problem=passwordProblem(newPassword);if(problem){setMessage(problem);return;}if(newPassword!==confirmation){setMessage("הסיסמאות החדשות אינן זהות.");return;}setBusy(true);try{const result=await authClient.changePassword({currentPassword,newPassword,revokeOtherSessions:true});if(result.error){setMessage(result.error.status===429 ? "בוצעו יותר מדי ניסיונות. נסו שוב בעוד דקה." : "שינוי הסיסמה לא הושלם. בדקו את הסיסמה הנוכחית ונסו שוב.");return;}await fetch("/api/account/preferences",{method:"POST"}).catch(()=>undefined);form.reset();setFailed(false);setMessage("הסיסמה האישית עודכנה בהצלחה.");}catch{setMessage("אין חיבור לשרת. שינוי הסיסמה לא אושר.");}finally{setBusy(false);}}}>
    <h2>שינוי סיסמה</h2><p>הסיסמה החדשה צריכה להכיל לפחות {PASSWORD_MIN} תווים. הכניסות האחרות לחשבון ינותקו לאחר השינוי.</p>
    <label htmlFor="account-current-password">הסיסמה הנוכחית</label><input id="account-current-password" name="currentPassword" type={visible?"text":"password"} autoComplete="current-password" dir="ltr" required disabled={busy}/>
    <label htmlFor="account-new-password">סיסמה חדשה</label><input id="account-new-password" name="newPassword" type={visible?"text":"password"} autoComplete="new-password" dir="ltr" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} required disabled={busy}/>
    <label htmlFor="account-confirmation">הקלדת הסיסמה החדשה שוב</label><input id="account-confirmation" name="confirmation" type={visible?"text":"password"} autoComplete="new-password" dir="ltr" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} required disabled={busy}/>
    <label className="ef-check"><input type="checkbox" checked={visible} onChange={event=>setVisible(event.target.checked)}/>הצגת הסיסמאות</label>
    {message&&<p role={failed?"alert":"status"} className={failed?"form-error":"notice"}>{message}</p>}
    <button className="btn btn-primary" type="submit" disabled={busy}>{busy?"מעדכנים…":"שמירת הסיסמה החדשה"}</button>
  </form>;
}
