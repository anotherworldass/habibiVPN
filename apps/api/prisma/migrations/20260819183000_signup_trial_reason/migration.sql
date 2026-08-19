-- AlterTable
ALTER TABLE `entitlement_ledgers` MODIFY `reason` ENUM('order_paid', 'iap', 'redeem', 'campaign', 'free_claim', 'admin_provision', 'refund_clawback', 'signup_trial') NOT NULL;
