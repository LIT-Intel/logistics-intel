import React, { useState, useEffect } from 'react';
import { Campaign } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Users } from 'lucide-react';

export default function AddToCampaignModal({ isOpen, onClose, company, onAdd }) {
    const [campaigns, setCampaigns] = useState([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadCampaigns();
        }
    }, [isOpen]);

    const loadCampaigns = async () => {
        setIsLoading(true);
        try {
            const userCampaigns = await Campaign.list('-created_date');
            setCampaigns(userCampaigns);
        } catch (error) {
            console.error('Failed to load campaigns:', error);
        }
        setIsLoading(false);
    };

    const handleAdd = () => {
        if (selectedCampaignId && company) {
            onAdd(company, selectedCampaignId);
            onClose();
            setSelectedCampaignId('');
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Add "{company?.name}" to Campaign
                    </DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    {isLoading ? (
                        <div className="text-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                            <p className="text-sm text-gray-600">Loading campaigns...</p>
                        </div>
                    ) : campaigns.length > 0 ? (
                        <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a campaign..." />
                            </SelectTrigger>
                            <SelectContent>
                                {campaigns.map(campaign => (
                                    <SelectItem key={campaign.id} value={campaign.id}>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{campaign.name}</span>
                                            <span className="text-xs text-gray-500">
                                                {campaign.status} • {campaign.target_companies?.length || 0} companies
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <div className="text-center py-8">
                            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500 mb-4">No campaigns found.</p>
                            <Button variant="outline" size="sm">
                                <Plus className="w-4 h-4 mr-2" />
                                Create Campaign
                            </Button>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button onClick={onClose} variant="outline">
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleAdd} 
                        disabled={!selectedCampaignId || isLoading}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        Add to Campaign
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}