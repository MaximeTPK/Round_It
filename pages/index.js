import dynamic from 'next/dynamic'
const AppInner = dynamic(() => import('../components/AppInner'), { ssr: false })
export default function Home() { return <AppInner /> }
