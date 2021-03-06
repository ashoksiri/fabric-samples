/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Context, Contract, Info, Transaction } from 'fabric-contract-api';
import { Asset } from './asset';
import { KeyEndorsementPolicy } from 'fabric-shim';

@Info({title: 'AssetContract', description: 'Asset Transfer Smart Contract, using State Based Endorsement(SBE), implemented in TypeScript' })
export class AssetContract extends Contract {

    // CreateAsset creates a new asset
    // CreateAsset sets the endorsement policy of the assetId Key, such that current owner Org Peer is required to endorse future updates
    @Transaction()
    public async CreateAsset(ctx: Context, assetId: string, value: number, owner: string): Promise<void> {
        const exists = await this.AssetExists(ctx, assetId);
        if (exists) {
            throw new Error(`The asset ${assetId} already exists`);
        }
        const ownerOrg = this.getClientOrgId(ctx);
        const asset = new Asset();
        asset.ID = assetId;
        asset.Value = value;
        asset.Owner = owner;
        asset.OwnerOrg = ownerOrg;
        const buffer = Buffer.from(JSON.stringify(asset));
        // Create the asset
        await ctx.stub.putState(assetId, buffer);
        // Set the endorsement policy of the assetId Key, such that current owner Org Peer is required to endorse future updates
        await this.setAssetStateBasedEndorsement(ctx, asset.ID, [ownerOrg]);
    }

    // ReadAsset returns asset with given assetId
    @Transaction(false)
    public async ReadAsset(ctx: Context, assetId: string): Promise<string> {
        const exists = await this.AssetExists(ctx, assetId);
        if (!exists) {
            throw new Error(`The asset ${assetId} does not exist`);
        }
        // Read the asset
        const assetJSON = await ctx.stub.getState(assetId);
        return assetJSON.toString();
    }

    // UpdateAsset updates an existing asset
    // UpdateAsset needs an endorsement of current owner Org Peer
    @Transaction()
    public async UpdateAsset(ctx: Context, assetId: string, newValue: number): Promise<void> {
        const assetString = await this.ReadAsset(ctx, assetId);
        const asset = JSON.parse(assetString) as Asset;
        asset.Value = newValue;
        const buffer = Buffer.from(JSON.stringify(asset));
        // Update the asset
        await ctx.stub.putState(assetId, buffer);
    }

    // DeleteAsset deletes an given asset
    // DeleteAsset needs an endorsement of current owner Org Peer
    @Transaction()
    public async DeleteAsset(ctx: Context, assetId: string): Promise<void> {
        const exists = await this.AssetExists(ctx, assetId);
        if (!exists) {
            throw new Error(`The asset ${assetId} does not exist`);
        }
        // Delete the asset
        await ctx.stub.deleteState(assetId);
    }

    // TransferAsset updates the Owner & OwnerOrg field of asset with given assetId, OwnerOrg must be a valid Org MSP Id
    // TransferAsset needs an endorsement of current owner Org Peer
    // TransferAsset re-sets the endorsement policy of the assetId Key, such that new owner Org Peer is required to endorse future updates
    @Transaction()
    public async TransferAsset(ctx: Context, assetId: string, newOwner: string, newOwnerOrg: string): Promise<void> {
        const assetString = await this.ReadAsset(ctx, assetId);
        const asset = JSON.parse(assetString) as Asset;
        asset.Owner = newOwner;
        asset.OwnerOrg = newOwnerOrg;
        // Update the asset
        await ctx.stub.putState(assetId, Buffer.from(JSON.stringify(asset)));
        // Re-Set the endorsement policy of the assetId Key, such that a new owner Org Peer is required to endorse future updates
        await this.setAssetStateBasedEndorsement(ctx, asset.ID, [newOwnerOrg]);
    }

    // AssetExists returns true when asset with given ID exists
    public async AssetExists(ctx: Context, assetId: string): Promise<boolean> {
        const buffer = await ctx.stub.getState(assetId);
        return (!!buffer && buffer.length > 0);
    }

    // setAssetStateBasedEndorsement sets an endorsement policy to the assetId Key
    // setAssetStateBasedEndorsement enforces that the owner Org Peers must endorse future update transactions for the specified assetId Key
    private async setAssetStateBasedEndorsement(ctx: Context, assetId: string, ownerOrgs: string[]): Promise<void> {
        let ep = new KeyEndorsementPolicy();
        ep.addOrgs("MEMBER", ...ownerOrgs);
        await ctx.stub.setStateValidationParameter(assetId, ep.getPolicy());
    }

    // getClientOrgId gets the client's OrgId (MSPID)
    private getClientOrgId(ctx: Context): string {
        return ctx.clientIdentity.getMSPID();
    }
}
