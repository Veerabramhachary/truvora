"use client"
import { useRouter } from "next/navigation";

const Page = () => {
    const router = useRouter()
    
  
    const handleCheckout = async (priceId: string) => {
       router.push(`/app/checkout?priceId=${priceId}`)
    };
  return (
    <div>Page</div>
  )
}
export default Page