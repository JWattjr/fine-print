import { notFound } from 'next/navigation';
import { ProbeDeploy } from '@/components/probe-deploy';

export const dynamic = 'force-dynamic';

export default function InternalProbePage(){
  if(process.env.NODE_ENV!=='development')notFound();
  return <ProbeDeploy/>;
}
