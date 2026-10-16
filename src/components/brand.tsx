import { Link } from 'wouter';
export function BrandMark(){return <svg className="brand-star" width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M16 4v24M4 16h24M7.5 7.5l17 17M24.5 7.5l-17 17"/></svg>;}
export function Brand(){return <Link href="/" className="site-brand" aria-label="CampConnect home">campconnect<BrandMark/></Link>;}
