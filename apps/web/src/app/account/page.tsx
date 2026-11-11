import type{Metadata}from"next";
import Link from"next/link";
import{redirect}from"next/navigation";
import{getCurrentUser}from"@/server/actor";
import{Logo}from"@/components/Logo";
import{PasswordForm}from"./PasswordForm";
export const metadata:Metadata={title:"החשבון שלי"};
export const dynamic="force-dynamic";
export default async function AccountPage(){
  const current=await getCurrentUser();if(!current)redirect("/login");
  return <main id="main" className="page account-page"><Link href="/" aria-label="MOZES LIFE — דף הבית"><Logo width={220}/></Link><header className="page-head"><h1>החשבון שלי</h1><p>{current.name} · <bdi>{current.email}</bdi></p></header><PasswordForm/><p><Link href="/">חזרה למסך הבית</Link></p></main>;
}
