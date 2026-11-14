// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Talks to the RoscaCommittee contract from Assignment 2 (unchanged).
interface IRoscaCommittee {
    function getMembers() external view returns (address[] memory);
    function getRoundInfo() external view returns (
        uint256 contributionWei, uint256 size, uint256 memberCount,
        uint256 currentRound, uint256 paidThisRound, address recipient, bool completed
    );
}

/// @title MemberReviews - second contract (bonus): members rate each other
///        once the committee has finished, building an on-chain trust record.
contract MemberReviews {
    struct Review { address reviewer; uint8 stars; string comment; }

    IRoscaCommittee public immutable committee;
    mapping(address => Review[]) private reviews;                 // member => reviews
    mapping(address => uint256) private totalStars;               // member => sum of stars
    mapping(address => mapping(address => bool)) private rated;   // reviewer => member => done?

    event MemberRated(address indexed reviewer, address indexed member, uint8 stars);

    constructor(address committeeAddress) {
        require(committeeAddress != address(0), "Committee address needed");
        committee = IRoscaCommittee(committeeAddress);
    }

    /// WRITE: rate another member 1-5 stars after the committee has finished.
    function rateMember(address member, uint8 stars, string calldata comment) external {
        require(stars >= 1 && stars <= 5, "Stars must be 1 to 5");
        require(member != msg.sender, "You cannot rate yourself");
        require(!rated[msg.sender][member], "Already rated this member");
        (, , , , , , bool completed) = committee.getRoundInfo();
        require(completed, "Committee not finished yet");
        require(_isMember(msg.sender), "Only committee members can rate");
        require(_isMember(member), "Rated address is not a member");

        rated[msg.sender][member] = true;
        totalStars[member] += stars;
        reviews[member].push(Review(msg.sender, stars, comment));
        emit MemberRated(msg.sender, member, stars);
    }

    function getReviewCount(address member) external view returns (uint256) {
        return reviews[member].length;
    }

    function getReview(address member, uint256 index) external view returns (address reviewer, uint8 stars, string memory comment) {
        Review storage r = reviews[member][index];
        return (r.reviewer, r.stars, r.comment);
    }

    /// Average rating multiplied by 100 (so 450 means 4.5 stars) and number of reviews.
    function getAverageRating(address member) external view returns (uint256 averageX100, uint256 count) {
        count = reviews[member].length;
        averageX100 = count == 0 ? 0 : (totalStars[member] * 100) / count;
    }

    function hasRated(address reviewer, address member) external view returns (bool) {
        return rated[reviewer][member];
    }

    function _isMember(address who) private view returns (bool) {
        address[] memory list = committee.getMembers();
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == who) return true;
        }
        return false;
    }
}
