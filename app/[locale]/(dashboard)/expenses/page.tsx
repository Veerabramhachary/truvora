import { Suspense } from "react"
import ExpenseContent from "./ExpenseContent"


const Page = () => {
  return (
    <Suspense fallback={<div>Loading expense...</div>}>
      <ExpenseContent />
    </Suspense>
  )
}
export default Page