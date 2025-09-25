"use client";

import UserMenu from "@/components/account/user-menu";
import { PLANS, type PlanId } from "@/lib/constants";

export default function PlanCards() {
  const items: PlanId[] = ["guest", "basic", "deluxe", "premium"];

  return (
    <div className="space-y-6">
      <UserMenu />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {items.map(id => {
          const plan = PLANS[id];
          return (
            <div key={id} className="rounded-lg border p-4">
              <div className="text-sm uppercase text-muted-foreground">{plan.name}</div>
              <div className="mt-2 text-2xl font-semibold">{plan.monthlyCredits.toLocaleString()} 크레딧</div>
              <div className="text-xs text-muted-foreground">({plan.monthlyImages.toLocaleString()}장)</div>
              <ul className="mt-4 text-sm leading-6">
                <li>월 한도 기준</li>
                <li>결제 미연동: 관리자 승인 필요</li>
              </ul>
              <div className="mt-4 text-xs text-muted-foreground">상단에서 플랜 선택 가능</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
